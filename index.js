const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const axios = require('axios');

async function callClaudeAPI(apiKey, prompt) {
  const apiEndpoint = 'https://api.anthropic.com/v1/messages';
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
  const requestBody = {
    model: 'claude-3-sonnet-20240229',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000,
  };

  const response = await axios.post(apiEndpoint, requestBody, { headers });
  return response.data.content[0].text;
}

async function callOpenAIAPI(apiKey, model, prompt) {
  const apiEndpoint = 'https://api.openai.com/v1/chat/completions';
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  const requestBody = {
    model: model === 'gpt-3.5' ? 'gpt-3.5-turbo' : 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a code review assistant.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 1000,
  };

  const response = await axios.post(apiEndpoint, requestBody, { headers });
  return response.data.choices[0].message.content;
}

async function reviewFile(apiKey, aiModel, filePath, fileDiff, fileContent) {
  const prompt = `Please review the following code changes for the file ${filePath}. Provide specific line-by-line comments where appropriate, and format your response as a JSON object with two keys: 'summary' for an overall summary, and 'lineComments' for an array of objects, each containing 'line' (line number) and 'comment' (your comment for that line).\n\nDiff:\n${fileDiff}\n\nFull file content:\n${fileContent}`;

  let reviewText;
  if (aiModel === 'claude-3.5-sonnet') {
    reviewText = await callClaudeAPI(apiKey, prompt);
  } else {
    reviewText = await callOpenAIAPI(apiKey, aiModel, prompt);
  }

  return JSON.parse(reviewText);
}

async function generateOverallSummary(apiKey, aiModel, allReviews) {
  const prompt = `Summarize the following code reviews for a pull request. Provide an overall assessment of the changes, highlighting key points, potential issues, and any patterns across the files:\n\n${allReviews}`;

  if (aiModel === 'claude-3.5-sonnet') {
    return await callClaudeAPI(apiKey, prompt);
  } else {
    return await callOpenAIAPI(apiKey, aiModel, prompt);
  }
}

async function getChangedFiles(baseBranch) {
  let output = '';
  await exec.exec('git', ['diff', '--name-only', `origin/${baseBranch}`], {
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
    },
  });
  return output.trim().split('\n');
}

async function getFileDiff(filePath, baseBranch) {
  let output = '';
  await exec.exec('git', ['diff', `origin/${baseBranch}`, '--', filePath], {
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
    },
  });
  return output;
}

async function getFileContent(filePath) {
  let output = '';
  await exec.exec('git', ['show', `HEAD:${filePath}`], {
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
    },
  });
  return output;
}

async function run() {
  try {
    if (!github.context.payload.pull_request) {
      console.log('This action only runs on pull request events.');
      return;
    }

    const githubToken = core.getInput('github-token');
    const apiKey = core.getInput('api-key');
    const aiModel = core.getInput('ai-model');
    const strict = core.getBooleanInput('strict', { required: false }) || false;

    // Validate ai-model input
    const validAiModels = ['claude-3.5-sonnet', 'gpt-3.5', 'gpt-4'];
    if (!validAiModels.includes(aiModel)) {
      core.setFailed(
        `Invalid ai-model: ${aiModel}. Accepted values are: ${validAiModels.join(
          ', '
        )}`
      );
      return;
    }

    const context = github.context;
    const repo = context.repo.repo;
    const owner = context.repo.owner;
    const pullRequestNumber = context.payload.pull_request.number;

    const octokit = github.getOctokit(githubToken);
    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullRequestNumber,
    });
    const baseBranch = pullRequest.base.ref;

    const changedFiles = await getChangedFiles(baseBranch);

    let fullReview = '';
    let allReviews = '';
    let comments = [];

    for (const filePath of changedFiles) {
      const fileDiff = await getFileDiff(filePath, baseBranch);
      const fileContent = await getFileContent(filePath);

      const review = await reviewFile(
        apiKey,
        aiModel,
        filePath,
        fileDiff,
        fileContent
      );

      allReviews += `File: ${filePath}\nSummary: ${review.summary}\n\n`;

      // Prepare comments for the review
      for (const lineComment of review.lineComments) {
        comments.push({
          path: filePath,
          line: lineComment.line,
          side: 'RIGHT',
          body: lineComment.comment,
        });
      }
    }

    // Generate overall summary
    const overallSummary = await generateOverallSummary(
      apiKey,
      aiModel,
      allReviews
    );

    // Submit the pull request review
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullRequestNumber,
      body: overallSummary,
      event: strict ? 'REQUEST_CHANGES' : 'COMMENT',
      comments: comments,
    });
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
