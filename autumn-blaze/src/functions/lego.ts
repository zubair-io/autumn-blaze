import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import axios from "axios";
import * as zlib from "zlib";
import * as csv from "csvtojson";
import { createBlogFromText } from "../lib/file.utils";

interface Lego {
  set: any;
  title: string;
  year: string;
  theme: string;
  parts: string;
  image: string;
}

interface SyrupDocument {
  uuid: string;
  schema: string;
  attributes: {
    editable: string;
    edit: string;
    view: string;
    tags: string[];
    collections: string[];
  };
  data: {
    type: string;
    content: any[];
  };
  meta: {
    title: string;
    description: string;
    image: string;
    providerId: string;
  };
  type: string;
  bookmarked: boolean;
}

// Helper Functions
async function downloadLego(legoJsonName: string) {
  const url = "https://cdn.rebrickable.com/media/downloads/sets.csv.gz";
  const response = await axios.get(url, { responseType: "stream" });
  const gunzip = zlib.createGunzip();
  response.data.pipe(gunzip);

  let buffer = Buffer.alloc(0);
  const file: string = await new Promise((resolve, reject) => {
    gunzip.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
    });

    gunzip.on("end", () => {
      resolve(buffer.toString());
    });

    gunzip.on("error", reject);
  });

  const body = await csv({
    noheader: false,
    headers: ["set", "title", "year", "theme", "parts", "image"],
  }).fromString(file);

  const json = await createBlogFromText(
    "data",
    legoJsonName,
    JSON.stringify(body),
    "application/json"
  );

  return { body, json };
}

async function getLegos(): Promise<Lego[]> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const epoch = today.getTime();
  const legoJsonName = `lego-${epoch}.json`;

  try {
    const response = await axios.get(
      `https://hornbeam.justmaple.app/data/${legoJsonName}`
    );
    return response.data;
  } catch (e) {
    const { body } = await downloadLego(legoJsonName);
    return body;
  }
}

// Main handler function
async function legoHttpHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("HTTP trigger function processed a request.");

  return {
    status: 200,
    jsonBody: await getLegos(),
  };
}

// Register the function
app.http("legoFunction", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: legoHttpHandler,
  route: "lego",
});
