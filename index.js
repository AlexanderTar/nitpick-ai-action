const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const axios = require('axios');

async function callClaudeAPI(apiKey, prompt) {
  const apiEndpoint = 'https://api.anthropic.com/v1/messages';
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  const requestBody = {
    model: 'claude-3-5-sonnet-20240620',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000,
  };

  const response = await axios.post(apiEndpoint, requestBody, { headers });
  return response.data.content[0].text;
}

async function callOpenAIAPI(apiKey, prompt) {
  const apiEndpoint = 'https://api.openai.com/v1/chat/completions';
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  const requestBody = {
    model: 'gpt-3.5-turbo',
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
  const prompt = `Review the following code changes for ${filePath}. You should extract the programming language from the file path and use it in your review process. Only include important, critical and actionable remarks only for added lines. Do not include unhelpful or encouraging remarks. Consider the following criteria when reviewing:

1. Code correctness and logic. Do not include remarks if the code is already correct.
2. Adherence to the detected language's best practices. Do not include remarks if the code is already adhering to the best practices.
3. Typos and grammar. Do not include remarks if the code is already correct.
4. Performance and efficiency. Do not include remarks if the code is already efficient.
5. Security vulnerabilities. Do not include remarks if the code is already secure.
6. Error handling and edge cases. Do not include remarks if the code is already error-free.
7. Code duplication and reusability. Do not include remarks if the code is already reusable.
8. Naming conventions and readability. Do not include remarks if the code is already readable.
9. Adherence to project-specific coding standards. Do not include remarks if the code is already adhering to the coding standards.
10. Potential race conditions or concurrency issues. Do not include remarks if the code is already race-free.
11. Proper use of language-specific features and best practices. Do not include remarks if the code is already using the best practices.
12. Testability and maintainability. Do not include remarks if the code is already testable and maintainable.

Consider the following code review best practices when generating your response:

Good code reviews look at the change itself and how it fits into the codebase. They will look through the clarity of the title and description and "why" of the change. They cover the correctness of the code, test coverage, functionality changes, and confirm that they follow the coding guides and best practices. They will point out obvious improvements, such as hard to understand code, unclear names, commented out code, untested code, or unhandled edge cases. They will also note when too many changes are crammed into one review, and suggest keeping code changes single-purposed or breaking the change into more focused parts. Better code reviews look at the change in the context of the larger system, as well as check that changes are easy to maintain. They might ask questions about the necessity of the change or how it impacts other parts of the system. They look at abstractions introduced and how these fit into the existing software architecture. They note maintainability observations, such as complex logic that could be simplified, improving test structure, removing duplications, and other possible improvements. Engineer Joel Kemp describes great code reviews as a contextual pass following an initial, light pass.

The tone of code reviews can greatly influence morale within teams. Reviews with a harsh tone contribute to a feeling of a hostile environment with their microaggressions. Opinionated language can turn people defensive, sparking heated discussions. At the same time, a professional and positive tone can contribute to a more inclusive environment. People in these environments are open to constructive feedback and code reviews can instead trigger healthy and lively discussions. Good code reviews ask open-ended questions instead of making strong or opinionated statements. They offer alternatives and possible workarounds that might work better for the situation without insisting those solutions are the best or only way to proceed. These reviews assume the reviewer might be missing something and ask for clarification instead of correction. Better code reviews are also empathetic. They know that the person writing the code spent a lot of time and effort on this change. These code reviews are kind and unassuming. They applaud nice solutions and are all-round positive.

Nitpicks are are unimportant comments, where the code could be merged without even addressing these. These could be things like variable declarations being in alphabetical order, unit tests following a certain structure, or brackets being on the same line. Good code reviews make it clear when changes are unimportant nitpicks. They usually mark comments like these distinctively, adding the “nit:” prefix to them. Too many of these can become frustrating and take the attention away from the more important parts of the review, so reviewers aim to not go overboard with these. Better code reviews realize that too many nitpicks are a sign of lack of tooling or a lack of standards. Reviewers who come across these frequently will look at solving this problem outside the code review process. For example, many of the common nitpick comments can be solved via automated linting. Those that cannot can usually be resolved by the team agreeing to certain standards and following them—perhaps even automating them, eventually.

Aspire to be a better code reviewer. Add as many remarks as you can in order to make the review more useful and actionable, while also being helpful to the author and not overwhelming them. The clearer the review, the more useful it is. Clearly indicate when a remark is unimportant nitpick. Do not make obvious remarks that are obvious to the author. Avoid making remarks that are already addressed in the diff or in the file content.

Format your response as a plain JSON string without any special tokens or markers with two keys: 'summary' for a brief overall assessment, and 'remarks' for an array of objects containing the following properties:
  - 'line' (number): The line number in the git diff input where you want to add a review comment. Starts at 1.
  - 'body' (string): The actual review comment for a specific line.

ONLY RETURN THE JSON STRING WITHOUT ANY OTHER TEXT OR METADATA.

Ensure that the 'line' value correctly corresponds to the line number in the diff file.

Git diff input format explanation:
The git diff input format consists of the following elements:
1. Line number: Each line starts with a line number, followed by a colon and a space.
2. Hunk header: Starts with '@@' and shows the line numbers for the changes in both the old and new versions.
3. Context lines: Unchanged lines, starting with a space.
4. Removed lines: Lines that were removed, starting with '-'.
5. Added lines: Lines that were added, starting with '+'.

Only include remarks for added lines.

The line numbers in your remarks should correspond to the actual line numbers at the beginning of each line in the git diff input.

Git diff input:
${fileDiff}

Full file content:
${fileContent}
`;

  let reviewText;
  if (aiModel === 'claude-3.5-sonnet') {
    reviewText = await callClaudeAPI(apiKey, prompt);
  } else {
    reviewText = await callOpenAIAPI(apiKey, prompt);
  }

  const review = JSON.parse(reviewText);

  const remarksWithPositions = review.remarks.map((remark) => {
    return {
      path: filePath,
      position: Number(remark.line) + 1,
      body: remark.body,
    };
  });

  return {
    summary: review.summary,
    remarks: remarksWithPositions,
  };
}

async function generateOverallSummary(apiKey, aiModel, allReviews) {
  const prompt = `Summarize the following code reviews for a pull request using Markdown formatting, the response should only contain Markdown. Try and make the summary as short and as concise as possible. Try to stay below 1000 characters. Provide an overall assessment of the changes, highlighting key points, potential issues, and any patterns across the files:\n\n${allReviews}`;

  if (aiModel === 'claude-3.5-sonnet') {
    return await callClaudeAPI(apiKey, prompt);
  } else {
    return await callOpenAIAPI(apiKey, prompt);
  }
}

async function getChangedFiles(baseBranch) {
  let output = '';
  await exec.exec(
    'git',
    ['diff', '--name-only', '--diff-filter=d', `origin/${baseBranch}`],
    {
      silent: true,
      listeners: {
        stdout: (data) => {
          output += data.toString();
        },
      },
    }
  );
  return output.trim().split('\n').filter(Boolean);
}

async function getFileDiff(filePath, baseBranch) {
  let output = '';
  await exec.exec('git', ['diff', `origin/${baseBranch}`, '--', filePath], {
    silent: true,
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
    },
  });
  const lines = output.split('\n').slice(5);
  return lines.map((line, index) => `${index + 1}: ${line}`).join('\n');
}

async function getFileContent(filePath) {
  let output = '';
  await exec.exec('git', ['show', `HEAD:${filePath}`], {
    silent: true,
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
    },
  });
  return output;
}

function shouldIgnoreFile(filePath, ignorePatterns) {
  return ignorePatterns.some((pattern) => {
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${regexPattern}$`).test(filePath);
  });
}

async function run() {
  try {
    if (!github.context.payload.pull_request) {
      console.log('This action only runs on pull request events.');
      return;
    }

    console.log('Starting AI-powered code review...');

    const githubToken = core.getInput('github-token');
    const apiKey = core.getInput('api-key');
    const aiModel = core.getInput('ai-model');
    const strict = core.getBooleanInput('strict', { required: false }) || false;
    const ignorePatterns = JSON.parse(core.getInput('ignore-patterns') || '[]');

    console.log(`Using AI model: ${aiModel}`);
    console.log(`Strict mode: ${strict}`);
    console.log(`Ignore patterns: ${JSON.stringify(ignorePatterns)}`);

    // Validate ai-model input
    const validAiModels = ['claude-3.5-sonnet', 'gpt-3.5'];
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

    console.log(`Reviewing PR #${pullRequestNumber} in ${owner}/${repo}`);

    const octokit = github.getOctokit(githubToken);
    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullRequestNumber,
    });
    const baseBranch = pullRequest.base.ref;

    console.log(`Base branch: ${baseBranch}`);

    // Fetch the latest changes from the remote repository
    console.log('Fetching latest changes...');
    await exec.exec('git', ['fetch', 'origin', baseBranch], {
      silent: true,
    });

    const changedFiles = await getChangedFiles(baseBranch);
    console.log(`Found ${changedFiles.length} changed files`);

    let allReviews = '';
    let comments = [];

    for (const filePath of changedFiles) {
      if (shouldIgnoreFile(filePath, ignorePatterns)) {
        continue;
      }
      console.log(`Reviewing file: ${filePath}`);
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

      // Add remark from the review with calculated positions
      for (const remark of review.remarks) {
        comments.push(remark);
      }
    }

    // Generate overall summary
    console.log('Generating overall summary...');
    const overallSummary = await generateOverallSummary(
      apiKey,
      aiModel,
      allReviews
    );

    // Submit the pull request review
    console.log('Submitting pull request review...');
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullRequestNumber,
      body: overallSummary,
      event: strict ? 'REQUEST_CHANGES' : 'COMMENT',
      comments: comments,
    });

    console.log('AI-powered code review completed successfully.');
  } catch (error) {
    console.error(`AI-powered code review failed: ${error.message}`);
  }
}

run();
