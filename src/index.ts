import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';
import { ReviewService } from './service/ReviewService';
import { ClaudeReviewService } from './service/ClaudeReviewService';
import { OpenAIReviewService } from './service/OpenAIReviewService';

function createReviewService(aiModel: string, apiKey: string): ReviewService {
  switch (aiModel) {
    case 'claude-3.5-sonnet':
      return new ClaudeReviewService(apiKey);
    case 'gpt-3.5':
      return new OpenAIReviewService(apiKey);
    default:
      throw new Error(`Unsupported AI model: ${aiModel}`);
  }
}

async function getChangedFiles(baseBranch: string): Promise<string[]> {
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
    },
  );
  return output.trim().split('\n').filter(Boolean);
}

async function getFileDiff(
  filePath: string,
  baseBranch: string,
): Promise<string> {
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

async function getFileContent(filePath: string): Promise<string> {
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

function shouldIgnoreFile(filePath: string, ignorePatterns: string[]): boolean {
  return ignorePatterns.some((pattern) => {
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${regexPattern}$`).test(filePath);
  });
}

async function run(): Promise<void> {
  try {
    console.log('Starting AI-powered code review...');

    const githubToken: string = core.getInput('github-token');
    const apiKey: string = core.getInput('api-key');
    const aiModel: string = core.getInput('ai-model');
    const strict: boolean =
      core.getBooleanInput('strict', { required: false }) || false;
    const ignorePatterns: string[] = JSON.parse(
      core.getInput('ignore-patterns') || '[]',
    );

    console.log(`Using AI model: ${aiModel}`);
    console.log(`Strict mode: ${strict}`);
    console.log(`Ignore patterns: ${JSON.stringify(ignorePatterns)}`);

    // Validate ai-model input
    const validAiModels = ['claude-3.5-sonnet', 'gpt-3.5'];
    if (!validAiModels.includes(aiModel)) {
      core.setFailed(
        `Invalid ai-model: ${aiModel}. Accepted values are: ${validAiModels.join(
          ', ',
        )}`,
      );
      return;
    }

    const context = github.context;
    const repo = context.repo.repo;
    const owner = context.repo.owner;

    if (!context.payload.pull_request) {
      console.log('This action only runs on pull request events.');
      return;
    }

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

    // Filter out ignored files
    const filesToReview = changedFiles.filter(
      (filePath) => !shouldIgnoreFile(filePath, ignorePatterns),
    );
    console.log(
      `Reviewing ${filesToReview.length} files after applying ignore patterns`,
    );

    const reviewService = createReviewService(aiModel, apiKey);

    const files = await Promise.all(
      filesToReview.map(async (filePath) => {
        const fileDiff = await getFileDiff(filePath, baseBranch);
        const fileContent = await getFileContent(filePath);
        return { path: filePath, diff: fileDiff, content: fileContent };
      }),
    );

    console.log('Preparing review...');
    const review = await reviewService.reviewFiles(files);

    // Submit the pull request review
    console.log('Submitting pull request review...');
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullRequestNumber,
      body: review.summary,
      event: strict ? 'REQUEST_CHANGES' : 'COMMENT',
      comments: review.remarks,
    });

    console.log('AI-powered code review completed successfully.');
  } catch (error) {
    // Do not fail the action if the review is not successful
    console.error(`AI-powered code review failed: ${(error as Error).message}`);
  }
}

run();
