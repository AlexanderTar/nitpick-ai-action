# Nitpick AI Action

Nitpick AI Action is a GitHub Action that performs automated code reviews using AI models. It analyzes pull requests, provides detailed feedback, and helps maintain code quality.

## Features

- Supports multiple AI models: Claude 3.5 Sonnet, GPT-3.5, and GPT-4
- Generates line-by-line comments on code changes
- Provides an overall summary of the pull request
- Configurable to either request changes or post comments
- Easy integration with GitHub workflows

## Inputs

This action accepts the following inputs:

### github-token

This input is required and should be set to `${{ secrets.GITHUB_TOKEN }}`. This token is used to authenticate and post reviews on the pull request.

### ai-model

Specify which AI model to use for the code review. The following options are available:

- `claude-3.5-sonnet`: Anthropic's Claude 3.5 Sonnet model (default)
- `gpt-3.5`: OpenAI's GPT-3.5 model
- `gpt-4`: OpenAI's GPT-4 model

This input is required.

### api-key

Provide the API key for the chosen AI model. This should be stored as a secret in your GitHub repository. This input is required.

### strict

Set this to `true` if you want the action to request changes on the pull request. If set to `false` (default), the action will post the review as a comment. This input is optional.

## Usage

To use Nitpick AI Action in your GitHub workflow, add the following step to your GitHub workflow file:

```yaml
- name: Nitpick AI Review
  uses: actions/nitpick-ai-action@v0.1.0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    api-key: ${{ secrets.AI_API_KEY }}
    ai-model: 'claude-3.5-sonnet'
    strict: false
```
