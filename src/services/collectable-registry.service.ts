import {
  CollectibleRegistry,
  ICollectibleRegistryDocument,
} from "../models/collectible-registry";
// import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getLegos, LegoThemes, fetchBricksetData } from "./lego.service";
//var DOMParser = require("xmldom").DOMParser;
import { DOMParser } from "prosemirror-model";
import { Schema as ProseSchema } from "prosemirror-model";
import { schema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { parseHTML } from "hostic-dom";

interface ProseMirrorDoc {
  type: "doc";
  content: ProseMirrorParagraph[];
}

interface ProseMirrorParagraph {
  type: "paragraph";
  content: ProseMirrorText[];
}

interface ProseMirrorText {
  type: "text";
  text: string;
}

export function textToProseMirror(html: string) {
  // if (!html.startsWith("<")) {
  // let n = html.split("\r\n<p><br>\r\n");
  // n[0] = `<p>${n[0].trim()}</p>`;
  // html = n.join("").split("\r\n").join("<p> </p>");

  html = html
    .trim()
    .split(/\n|\r\n|<br>|<br\/>/)
    // Trim whitespace
    .map((str) => str.trim())
    // Filter out empty strings
    .filter((str) => str.length > 0)
    // Wrap in p tags
    .map((str) => `<p>${str}</p>`)
    // Join back to string
    .join("");

  html = `<div>${html}</div>`;
  //}
  console.log(html);

  const dom = parseHTML(html);
  console.log(dom);

  return DOMParser.fromSchema(schema).parse(dom).toJSON();
}

//   var parser = new DOMParser();
//   var document = parser.parseFromString(html, "text/xml");
//   console.log(document[0]);
//   const ps = new Parser(schema, []);
//   console.log(ps.parse(document));
//   return JSON.parse(JSON.stringify(ps.parse(document)));
// }

function textToProseMirrorOld(text: string): ProseMirrorDoc {
  // Split text into paragraphs
  const paragraphs = text
    .split(/\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Convert each paragraph to ProseMirror format
  const content: ProseMirrorParagraph[] = paragraphs.map((paragraph) => ({
    type: "paragraph" as const, // Use const assertion
    content: [
      {
        type: "text" as const, // Use const assertion
        text: paragraph,
      },
    ],
  }));

  return {
    type: "doc" as const, // Use const assertion
    content,
  };
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI);
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp",
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
};

export class CollectableRegistryService {
  private static instance: CollectableRegistryService;

  private constructor() {}

  static async getInstance(): Promise<CollectableRegistryService> {
    if (!CollectableRegistryService.instance) {
      CollectableRegistryService.instance = new CollectableRegistryService();
    }
    return CollectableRegistryService.instance;
  }

  async getCollectableRegistryById(
    id: string,
  ): Promise<ICollectibleRegistryDocument | null> {
    return CollectibleRegistry.findById(id);
  }

  async getCollectableRegistry(
    providerId: string,
    provider: "lego" | "book",
  ): Promise<ICollectibleRegistryDocument | null> {
    return await CollectibleRegistry.findOne({ providerId, provider });
  }

  async createCollectableRegistry(
    input: CollectibleRegistry,
  ): Promise<ICollectibleRegistryDocument | any> {
    console.log(
      "Creating collectable registry:",
      input.provider,
      input.providerId,
    );
    const collection = await CollectibleRegistry.create(input);
    return collection.toJSON();
  }

  async update(id: string, input: CollectibleRegistry) {
    return await CollectibleRegistry.updateOne({ _id: id }, input);
  }

  async getCollectableRegistryByProviderId(provider: string) {
    return await CollectibleRegistry.find({ provider });
  }

  async getCollectableRegistrySince(provider: string, since?: Date) {
    const query: any = { provider };
    if (since) {
      // Use $gt (greater than) to avoid returning the same record twice
      query.updatedAt = { $gt: since };
    }
    // Sort by updatedAt ascending so client can easily find the newest
    return await CollectibleRegistry.find(query);
    //.sort({ updatedAt: 1 });
  }

  async createLegoTags(itemId: string) {
    const legos = await getLegos();
    const lego = legos.find((lego) => lego.set === itemId);
    if (!lego) {
      return {
        tags: [],
        lego: {},
      };
    }
    const themes: {
      type: "system";
      value: string;
    }[] = [];
    const legoTheme = LegoThemes.find((theme) => theme.id === +lego.theme);
    themes.push({
      type: "system",
      value: legoTheme?.name || lego.theme,
    });

    if (legoTheme?.parent_id) {
      const parentTheme = LegoThemes.find(
        (theme) => theme.id === legoTheme?.parent_id,
      );
      themes.unshift({
        type: "system",
        value: (parentTheme?.name || legoTheme?.parent_id) + "",
      });
    }

    const tags = [
      {
        type: "system",
        value: itemId.split("-")[0].trim(),
      },
      ...themes,
      {
        type: "system",
        value: lego.year,
      },
    ];
    return {
      tags,
      lego,
      title: lego.title,
    };
  }
  async googleBookCollectableRegistryData(providerId: string) {
    console.log(
      `https://www.googleapis.com/books/v1/volumes/${providerId}?key=${process.env["GOOGLE_BOOKS"]}`,
    );
    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes/${providerId}?key=${process.env["GOOGLE_BOOKS"]}`,
    );

    const json = await response.json();

    return this.handleGoogleBookData(json);
  }

  handleGoogleBookData(json: any) {
    const imageOrder = [
      "extraLarge",
      "large",
      "medium",
      "small",
      "thumbnail",
      "smallThumbnail",
    ];

    const toImageArray = (images: Record<string, string>): string[] => {
      return [
        imageOrder.map((key) => images[key]).filter((url) => !!url)[0],
      ].filter((url) => !!url);
    };

    const getISBN = (
      industryIdentifiers: Array<{ type: string; identifier: string }>,
    ): string => {
      let isbn10 = "";

      for (const id of industryIdentifiers) {
        if (id.type === "ISBN_13") return id.identifier;
        if (id.type === "ISBN_10") isbn10 = id.identifier;
      }

      return isbn10 || "";
    };

    const title = json.volumeInfo.title;
    const description = textToProseMirror(json.volumeInfo.description);
    const images = toImageArray(json.volumeInfo.imageLinks);
    const providerData = json;
    const upc = getISBN(json.volumeInfo.industryIdentifiers);
    const providerId = json.id;

    const tags = [
      {
        type: "system",
        label: "Author" + (json.volumeInfo.authors.length > 1 ? "s" : ""),
        value: json.volumeInfo.authors.join(" | "),
      },
      {
        type: "system",
        label: "Pages",
        value: json.volumeInfo.pageCount,
      },
      {
        type: "system",
        label: "Publisher",
        value: json.volumeInfo.publisher,
      },
      {
        type: "system",
        label: "Publish Date",
        value: json.volumeInfo.publishedDate,
      },
    ];

    return {
      title,
      description,
      images,
      providerData,
      tags,
      upc,
      ean: "",
      providerId,
    };
  }

  async createCollectableRegistryData(
    provider: "lego" | "book",
    providerId: string,
  ) {
    if (provider === "lego") {
      return await this.legoCollectableRegistry(providerId);
    }
    if (provider === "book") {
      return await this.googleBookCollectableRegistryData(providerId);
    }
    throw new Error("Unknown Provider");
  }

  async createCollectableRegistryItem(provider, providerId) {
    const { title, description, images, providerData, tags, upc, ean } =
      await this.createCollectableRegistryData(provider, providerId);

    const result = await this.createCollectableRegistry({
      providerId,
      provider,
      title,
      description,
      images,
      providerData,
      tags,
      upc,
      ean,
    });

    return result;
  }

  async getOrCreateCollectableRegistry(
    providerId: string,
    provider: string,
  ): Promise<ICollectibleRegistryDocument | any> {
    console.log(
      `[getOrCreateCollectableRegistry] Checking for existing: ${provider}/${providerId}`,
    );
    const registry = await this.getCollectableRegistry(providerId, provider);
    if (registry) {
      console.log(
        `[getOrCreateCollectableRegistry] Found existing registry for ${providerId}`,
      );
      return registry;
    }

    return await this.createCollectableRegistryItem(provider, providerId);
  }
  cleanTitle(str: string) {
    const title = str
      .replace(/Lego|#|\b\d{4,}\b|-|\s+/gi, (match) =>
        match.match(/\s+/) ? " " : "",
      )
      .trim();

    const titleA = title.split(" | ");
    if (titleA.length === 3) {
      return titleA[0];
    }
    return title;
  }

  extractSetNumber(str: string) {
    const regex = /\b\d{4,}\b/;
    const match = str.match(regex);
    return match ? match[0] : null;
  }
  async getOrCreateCollectableRegistryByUPC(upc: string) {
    const registry = await CollectibleRegistry.findOne({ upc: upc });

    if (registry) {
      return registry;
    }

    const book = await this.createBookCollectableRegistryByUPC(upc);
    if (book) {
      const provider = "book";
      const { providerId, title, description, images, providerData, tags } =
        book;
      return await this.createCollectableRegistry({
        providerId,
        provider,
        title,
        description,
        images,
        providerData,
        tags,
        upc,
      });
    }

    return await this.createLegoCollectableRegistryByUPC(upc);
  }

  async createBookCollectableRegistryByUPC(upc: string) {
    const url = new URL("https://www.googleapis.com/books/v1/volumes/");

    // Add query parameters
    const params = url.searchParams;
    params.append("q", `isbn:${upc}`);
    params.append("key", process.env["GOOGLE_BOOKS"]);

    url.toString();

    const response = await fetch(url.toString());
    const json = await response.json();
    if (!json.totalItems) {
      return null;
    }
    return this.handleGoogleBookData(json.items[0]);
  }
  async createLegoCollectableRegistryByUPC(
    upc: string,
  ): Promise<ICollectibleRegistryDocument | any> {
    const upcResults = await fetch(
      "https://api.upcitemdb.com/prod/trial/lookup?upc=" + upc,
    );
    const upcData = await upcResults.json();

    const upcInfo = {
      title: "",
      providerId: "",
      descriptionText: "",
    };

    if (upcData.items[0]) {
      upcInfo.title = this.cleanTitle(upcData.items[0].title);
      upcInfo.providerId =
        (this.extractSetNumber(upcData.items[0].title) ||
          this.extractSetNumber(upcData.items[0].description)) + "-1";
      upcInfo.descriptionText = upcData.items[0].description;
    }

    if (!upcData.items[0] || upcInfo.providerId === "null-1") {
      //throw new Error("No Lego found for" + upc);
      const response = await fetch(
        `https://api.barcodelookup.com/v3/products?barcode=${upc}&formatted=y&key=z32v3z18bav089inrfxvr80cbtd9x5`,
      );
      const responseJson = await response.json();

      upcInfo.title = this.cleanTitle(responseJson.products[0].title);
      upcInfo.providerId =
        (this.extractSetNumber(responseJson.products[0].title) ||
          this.extractSetNumber(responseJson.products[0].description)) + "-1";
      upcInfo.descriptionText = responseJson.products[0].description;
    }

    const { title, providerId, descriptionText } = upcInfo;

    if (!providerId || providerId === "null-1") {
      throw new Error("No Lego ID found");
    }

    const lookupById = await CollectibleRegistry.findOne({
      providerId,
      provider: "lego",
    });
    if (lookupById) {
      await CollectibleRegistry.updateOne(
        {
          providerId,
          provider: "lego",
        },
        {
          $set: {
            upc,
            providerData: {
              ...lookupById.providerData,
              upc,
              upcData,
            },
          },
        },
      );
      return lookupById;
    }

    // Fetch data from Brickset
    const { ean, description } = await fetchBricksetData(providerId);
    const { tags, lego } = await this.createLegoTags(providerId);

    return this.createCollectableRegistry({
      upc,
      ean: ean || "",
      providerId,
      provider: "lego",
      title,
      description: description || { type: "doc", content: [] },
      images: [`https://lego.justmaple.app/${providerId}.jpg`],
      providerData: {
        upc,
        upcData,
        description: descriptionText,
        lego,
      },
      tags,
    });
  }

  async legoCollectableRegistry(itemId: string) {
    console.log(`[legoCollectableRegistry] Starting for itemId: ${itemId}`);

    const { tags, lego, title: altTitle } = await this.createLegoTags(itemId);
    console.log(`[legoCollectableRegistry] Tags created, title: ${altTitle}`);

    const { upc, ean, description } = await fetchBricksetData(itemId);
    console.log(
      `[legoCollectableRegistry] Brickset data fetched - UPC: ${upc}, EAN: ${ean}, hasDescription: ${!!description}`,
    );

    const result = {
      upc: upc || "",
      ean: ean || "",
      title: altTitle,
      description: description || { type: "doc", content: [] },
      images: [`https://lego.justmaple.app/${itemId}.jpg`],
      providerId: itemId,
      provider: "lego",
      tags,
      providerData: {
        lego,
      },
    };

    console.log(`[legoCollectableRegistry] Returning data for ${itemId}`);
    return result;
  }
}
