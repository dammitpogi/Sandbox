#!/usr/bin/env node
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { URL } from "node:url";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const MAX_REDIRECTS = 5;

type CliArgs = {
  url: string;
  output: string;
};

function parseArgs(argv: string[]): CliArgs {
  const [urlArg, outputArg] = argv;

  if (!urlArg || urlArg === "--help" || urlArg === "-h") {
    printUsage();
    process.exit(urlArg ? 0 : 1);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlArg);
  } catch {
    throw new Error(`Invalid URL: ${urlArg}`);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  const output = outputArg
    ? resolve(outputArg)
    : resolve(process.cwd(), inferFilenameFromUrl(parsedUrl));

  return { url: parsedUrl.toString(), output };
}

function inferFilenameFromUrl(url: URL): string {
  const pathname = url.pathname;
  const lastSegment = pathname.split("/").filter(Boolean).pop();
  return lastSegment || "downloaded-file";
}

function printUsage(): void {
  console.log(`Usage:\n  download-file <url> [output-path]\n\nExamples:\n  download-file https://example.com/file.zip\n  download-file https://example.com/file.zip ./downloads/file.zip`);
}

function download(url: string, output: string, redirects = 0): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const parsed = new URL(url);
    const requestImpl = parsed.protocol === "https:" ? httpsRequest : httpRequest;

    const request = requestImpl(parsed, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = response.headers.location;

      if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
        response.resume();
        if (redirects >= MAX_REDIRECTS) {
          rejectPromise(new Error(`Too many redirects (>${MAX_REDIRECTS}).`));
          return;
        }
        const nextUrl = new URL(location, parsed).toString();
        download(nextUrl, output, redirects + 1).then(resolvePromise).catch(rejectPromise);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        rejectPromise(new Error(`Download failed with status ${statusCode}.`));
        return;
      }

      mkdirSync(dirname(output), { recursive: true });
      const fileStream = createWriteStream(output);

      response.pipe(fileStream);

      fileStream.on("finish", () => {
        fileStream.close(() => resolvePromise());
      });

      fileStream.on("error", (streamError) => {
        rejectPromise(streamError);
      });

      response.on("error", (responseError) => {
        rejectPromise(responseError);
      });
    });

    request.on("error", (requestError) => {
      rejectPromise(requestError);
    });

    request.end();
  });
}

async function main(): Promise<void> {
  try {
    const { url, output } = parseArgs(process.argv.slice(2));
    console.log(`Downloading ${url}`);
    await download(url, output);
    console.log(`Saved to ${output}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

void main();
