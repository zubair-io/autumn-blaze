import {
  CollectibleRegistry,
  ICollectibleRegistryDocument,
} from "../models/collectible-registry";
// import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getLegos, LegoThemes } from "./lego.service";
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

function textToProseMirror(html: string) {
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
    provider,
  ): Promise<ICollectibleRegistryDocument | null> {
    return await CollectibleRegistry.findOne({ providerId, provider });
  }

  async createCollectableRegistry(
    input: CollectibleRegistry,
  ): Promise<ICollectibleRegistryDocument | any> {
    const collection = await CollectibleRegistry.create(input);
    return collection.toJSON();
  }

  async update(id: string, input: CollectibleRegistry) {
    return await CollectibleRegistry.updateOne({ _id: id }, input);
  }

  async getCollectableRegistryByProviderId(provider: string) {
    return await CollectibleRegistry.find({ provider });
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

    return { title, description, images, providerData, tags, upc, providerId };
  }

  async createCollectableRegistryData(provider, providerId) {
    if (provider === "lego") {
      return await this.legoCollectableRegistry(providerId);
    }
    if (provider === "book") {
      return await this.googleBookCollectableRegistryData(providerId);
    }
    throw new Error("Unknown Provider");
  }

  async getOrCreateCollectableRegistry(
    providerId: string,
    provider: string,
  ): Promise<ICollectibleRegistryDocument | any> {
    const registry = await this.getCollectableRegistry(providerId, provider);
    if (registry) {
      return registry;
    }

    const { title, description, images, providerData, tags, upc } =
      await this.createCollectableRegistryData(provider, providerId);

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

    const { proseMirror: description, text: generatedText } =
      await this.generateCollectableRegistryDescription(
        providerId,
        descriptionText,
      );
    const { tags, lego } = await this.createLegoTags(providerId);

    return this.createCollectableRegistry({
      upc,
      providerId,
      provider: "lego",
      title,
      description,
      images: [`https://lego.justmaple.app/${providerId}.jpg`],
      providerData: {
        upc,
        upcData,
        description: descriptionText,
        generatedText,
        lego,
      },
      tags,
    });
  }

  async legoCollectableRegistry(itemId: string) {
    const {
      title,
      pageText,
      rawText,
      image,
      description: desc,
    } = await this.loadLegoProductPage(itemId);
    const { proseMirror: description, text: generatedText } =
      await this.generateCollectableRegistryDescription(itemId, pageText);
    const { tags, lego, title: altTitle } = await this.createLegoTags(itemId);
    return {
      upc: "",
      title: title || altTitle,
      description,
      images: [`https://lego.justmaple.app/${itemId}.jpg`],
      providerId: itemId,
      provider: "lego",
      tags,
      providerData: {
        //  rawText,
        image,
        description: desc,
        generatedText,
        lego,
      },
    };
  }

  async generateCollectableRegistryDescription(
    setNumber: string,
    webData: string,
  ) {
    const prompt = `You are tasked with creating a fun and informative description of a specific LEGO set based on information from the LEGO website. Follow these instructions carefully:
            
            1. For Lego Set Number ${setNumber} and  website data/description ${webData} into write a  informative description of a specific LEGO
            2. this should be written in a professional tone, focusing on the set's features, contents, and design.
            3. Create a formal and informative description of the LEGO set based on the information you find. Your description should:
               a. Be written in a professional but engaging tone
               b. Focus on the set's features, contents, and design
               c. Include the following information if available:
                  - Piece count
                  - Minifigure count
                  - Age range recommendation
                  - Theme or product line the set belongs to
                  - Any unique or notable features of the set
                  - Dimensions of the completed model (if provided)
            
            4. Do NOT include any information about:
               - Pricing
               - Gifts with purchase
               - Free shipping offers
               - Any promotional or marketing language
            
            5. If the set is recommended for ages 18+, mention this but do not refer to it as a set \"exclusively for adults.\"
            
            6. Ensure your description is cohesive and well-structured, presenting the information in a logical order.
            
              
            "Only respond with the requested information and no summary of the request"
            Don't start with The LEGO set, identified by product number... or similar phrasing. Just start with the description.
            Don't use the work "identified"
            `;

    const result = await model.generateContent(prompt);

    const text = result.response.text();
    return {
      proseMirror: textToProseMirror(text),
      text,
    };

    return;
  }

  async loadLegoProductPage(itemId: string) {
    itemId = itemId.split("-")[0].trim();
    let page = await fetch("https://www.lego.com/en-us/product/" + itemId);
    if (page.status !== 200) {
      page = await fetch(
        `https://www.bricklink.com/v2/catalog/catalogitem.page?S=${itemId}-1`,
      );
    }
    const rawText = await page.text();
    const $ = cheerio.load(rawText);
    const textArr = $("main")
      .find("*")
      .map((_, el) => $(el).text())
      .get()

      .filter((text) => text.trim().length > 3);

    const uniqueSet = new Set(textArr);

    const uniqueArray = Array.from(uniqueSet);
    let title = this.cleanTitle(
      $('meta[property="og:title"]').attr("content") || $("title").text(),
    );

    let description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content");
    let image = $('meta[property="og:image"]').attr("content");

    if (title.includes("Page Not Found")) {
      title = null;
      image = null;
      description = null;
    }

    return {
      title,
      description,
      image,
      rawText,
      pageText: `
      ${title}
      ${description}
      ${uniqueArray.join("\n")}`,
    };
  }
  //   async generateLegoDescription() {
  //     const anthropic = new Anthropic({
  //       // defaults to
  //       apiKey: process.env["ANTHROPIC_API_KEY"],
  //     });

  //     const LEGO_WEBSITE_TEXT = "";
  //     const SET_NAME = "";
  //     const msg = await anthropic.messages.create({
  //       model: "claude-3-5-sonnet-20241022",
  //       max_tokens: 4096,
  //       temperature: 0,
  //       messages: [
  //         {
  //           role: "user",
  //           content: [
  //             {
  //               type: "text",
  //               text: `You are tasked with creating a formal and informative description of a specific LEGO set based on information from the LEGO website. Follow these instructions carefully:

  //             1. You will be provided with the following inputs:
  //             <lego_website_text>
  //             ${LEGO_WEBSITE_TEXT}
  //             </lego_website_text>

  //             <set_name>
  //             ${SET_NAME}
  //             </set_name>

  //             2. Search through the LEGO website text to find information specific to the LEGO set named in the <set_name> tags.

  //             3. Create a formal and informative description of the LEGO set based on the information you find. Your description should:
  //                a. Be written in a professional and objective tone
  //                b. Focus on the set's features, contents, and design
  //                c. Include the following information if available:
  //                   - Piece count
  //                   - Minifigure count
  //                   - Age range recommendation
  //                   - Theme or product line the set belongs to
  //                   - Any unique or notable features of the set
  //                   - Dimensions of the completed model (if provided)

  //             4. Do NOT include any information about:
  //                - Pricing
  //                - Gifts with purchase
  //                - Free shipping offers
  //                - Any promotional or marketing language

  //             5. If the set is recommended for ages 18+, mention this but do not refer to it as a set \"exclusively for adults.\"

  //             6. Ensure your description is cohesive and well-structured, presenting the information in a logical order.

  //             7. If you cannot find information about the specified set in the provided text, state that you don't have enough information to describe the set accurately.

  //             8. Present your final description within <description> tags.

  //             Example output format:
  //             <description>
  //             The LEGO [Set Name] is a [piece count]-piece set from the [Theme] product line. Designed for builders aged [age range], this set features [notable features]. The set includes [minifigure count] minifigures and builds into a model measuring [dimensions if available]. [Any other relevant, formal information about the set's design or play features.]
  //             </description>

  //             Remember to adjust the format and content based on the available information, always maintaining a formal and informative tone.`,
  //             },
  //           ],
  //         },
  //       ],
  //     });
  //     const text = msg.content.find((msg) => msg.type === "text").text;
  //     return {
  //       proseMirror: textToProseMirror(text),
  //       text,
  //     };
  //   }
}
