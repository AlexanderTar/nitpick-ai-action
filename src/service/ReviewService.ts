export interface Review {
  summary: string;
  remarks: Remark[];
}

export interface Remark {
  path: string;
  position: number;
  body: string;
}

export abstract class ReviewService {
  protected apiKey: string;
  protected static readonly REVIEW_PROMPT = `Review the provided file based on its diff and full content. Format your response as a JSON string with the following structure:
{
  "summary": "A Markdown-formatted string containing the assessment for this file",
  "remarks": [
    {
      "path": "The file path of the reviewed file",
      "position": "The position in the diff where the comment applies (a number)",
      "body": "The detailed comment or suggestion"
    },
    // ... additional remarks
  ]
}

File Diff Format:
The diff provided follows this custom format:
1. Each line is prepended with a line number (starting from 1) followed by a colon and space.
2. There is no diff header.
3. Hunk headers look like this:
   n: @@ -start,lines +start,lines @@
   Where 'n' is the line number in the diff.
4. The actual changes are represented as follows:
   - Lines starting with '-' (after the line number) are removals
   - Lines starting with '+' (after the line number) are additions

Example:
1: @@ -1,3 +1,4 @@
2: const example = () => {
3: -  console.log("Hello");
4: +  console.log("Hello, World!");
5: +  return true;
6: };

For the "summary" field:
- Provide a comprehensive assessment of the changes in this file as a Markdown-formatted string
- Use Markdown features such as headers, lists, code blocks, and emphasis where appropriate
- Include the following sections:
  1. File Overview: A brief description of the file and its purpose
  2. Key Changes: Highlight the most significant modifications in this file
  3. Strengths: Point out particularly well-implemented parts
  4. Areas for Improvement: Suggest improvements specific to this file
- Keep the total length reasonable (aim for less than 500 characters)

Consider the following criteria when reviewing:

1. Code correctness and logic
2. Adherence to the detected language's best practices
3. Performance and efficiency
4. Security vulnerabilities
5. Error handling and edge cases
6. Code duplication and reusability
7. Naming conventions and readability
8. Adherence to project-specific coding standards
9. Potential race conditions or concurrency issues
10. Proper use of language-specific features and best practices
11. Testability and maintainability

For each remark:
- Specify the exact file path
- Calculate the position in the diff as follows:
  * The position value is the line number in the diff (the number before the colon)
  * The first line after a hunk header (@@) is considered position 1 for that hunk
  * Count all lines, including removals, additions, and context lines
- Provide a detailed explanation or suggestion in the body
- Focus on important, actionable, and helpful comments
- Minimize the number of nitpicks
- If including a nitpick, start the body with "[Nitpick]: " to clearly mark it as such

Guidelines for remarks:
1. Prioritize significant issues that affect code quality, performance, or security
2. Provide actionable feedback with clear suggestions for improvement
3. Highlight potential bugs or logical errors
4. Point out opportunities for code optimization or simplification
5. Suggest improvements to code structure or organization
6. Identify missing error handling or edge case considerations
7. Recommend ways to improve code readability or maintainability
8. Avoid comments on minor stylistic issues unless they significantly impact readability
9. Limit the total number of remarks to ensure focus on the most important issues (aim for 3-5 max per file)

Ensure that your response is a valid JSON string that can be parsed directly.`;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // Abstract method to be implemented by subclasses
  protected abstract callApi(prompt: string): Promise<string>;

  private async generateFileReview(
    path: string,
    diff: string,
    content: string,
  ): Promise<Review> {
    const prompt = `${ReviewService.REVIEW_PROMPT}

File path: ${path}

Diff:
${diff}

Full file content:
${content}`;

    const response = await this.callApi(prompt);
    return JSON.parse(response) as Review;
  }

  private async reviewFile(
    path: string,
    diff: string,
    content: string,
  ): Promise<Review> {
    return this.generateFileReview(path, diff, content);
  }

  private async combineReviews(reviews: Review[]): Promise<Review> {
    const combinedSummary = reviews.map((r) => r.summary).join('\n\n');
    const combinedRemarks = reviews.flatMap((r) => r.remarks);

    const prompt = `Combine the following file reviews into a single overall review:

${combinedSummary}

Format your response as a JSON string with the following structure:
{
  "summary": "A Markdown-formatted string containing the overall assessment for this pull request",
  "remarks": []
}

For the "summary" field:
- Provide a comprehensive assessment of all changes in this pull request as a Markdown-formatted string
- Use Markdown features such as headers, lists, code blocks, and emphasis where appropriate
- Include the following sections:
  1. Pull Request Overview: A brief description of the pull request and its purpose
  2. Key Changes: Highlight the most significant modifications across all files
  3. Strengths: Point out particularly well-implemented parts across the entire pull request
  4. Areas for Improvement: Suggest improvements for the pull request as a whole
- Keep the total length reasonable (aim for less than 1000 characters)

Consider the following criteria when reviewing:

1. Overall code quality and consistency
2. Adherence to project-wide best practices and coding standards
3. Impact on system performance and efficiency
4. Potential security implications
5. Comprehensive error handling and edge case considerations
6. Code reusability and modular design
7. Naming conventions and overall readability
8. Testability and maintainability of the changes
9. Potential effects on other parts of the system

Ensure that your response is a valid JSON string that can be parsed directly.`;

    const response = await this.callApi(prompt);
    const overallReview = JSON.parse(response) as Review;

    return {
      summary: overallReview.summary,
      remarks: combinedRemarks,
    };
  }

  async reviewFiles(
    files: { path: string; diff: string; content: string }[],
  ): Promise<Review> {
    const fileReviews = await Promise.all(
      files.map((file) => this.reviewFile(file.path, file.diff, file.content)),
    );
    return this.combineReviews(fileReviews);
  }
}
