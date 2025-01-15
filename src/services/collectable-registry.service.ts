import {
  CollectibleRegistry,
  ICollectibleRegistryDocument,
} from "../models/collectible-registry";
// import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getLegos, LegoThemes } from "./lego.service";
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

function textToProseMirror(text: string): ProseMirrorDoc {
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

const genAI = new GoogleGenerativeAI(process.env["GEMINI"]);
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
    };
  }

  async getOrCreateCollectableRegistry(
    providerId: string,
    provider: string,
  ): Promise<ICollectibleRegistryDocument | any> {
    return this.getCollectableRegistry(providerId, provider).then(
      async (registry) => {
        if (registry) {
          return registry;
        }

        const { title, description, images, providerData, tags } =
          await this.legoCollectableRegistry(providerId);
        return this.createCollectableRegistry({
          providerId,
          provider,
          title,
          description,
          images,
          providerData,
          tags,
        });
      },
    );
  }
  extractLastNumber(str) {
    const match = str.match(/\d+$/);
    return match ? match[0] : null;
  }
  async getOrCreateCollectableRegistryByUPC(
    upc: string,
  ): Promise<ICollectibleRegistryDocument | any> {
    console.log("upc", upc);
    const registry = await CollectibleRegistry.findOne({ upc: upc });

    if (registry) {
      return registry;
    }
    console.log("not found by up", upc);
    const upcResults = await fetch(
      "https://api.upcitemdb.com/prod/trial/lookup?upc=" + upc,
    );
    console.log("upcResults", upcResults);
    const upcData = await upcResults.json();
    const title = upcData.items[0].title.split(" - ")[1].trim();
    const providerId = this.extractLastNumber(title) + "-1";

    if (!providerId) {
      throw new Error("No Lego ID found");
    }
    const descriptionText = upcData.items[0].description;

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

    console.log("not found by lego id", providerId);

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
    const { tags, lego } = await this.createLegoTags(itemId);
    return {
      title,
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
    const page = await fetch("https://www.lego.com/en-us/product/" + itemId);
    const rawText = await page.text();
    const $ = cheerio.load(rawText);
    const textArr = $("main")
      .find("*")
      .map((_, el) => $(el).text())
      .get()

      .filter((text) => text.trim().length > 3);

    const uniqueSet = new Set(textArr);

    const uniqueArray = Array.from(uniqueSet);
    const title = $('meta[property="og:title"]')
      .attr("content")
      .split("|")[0]
      .trim();
    const description = $('meta[property="og:description"]').attr("content");
    const image = $('meta[property="og:image"]').attr("content");

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
