import { v4 as Uuid } from "uuid";
import * as azure from "azure-storage";
// import * as fsWalk from '@nodelib/fs.walk';

interface SearchFunc {
  (source: any, subany: any, ok: any): any;
}

export async function asyncForEach<T>(array: T[], callback: SearchFunc) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

export interface Base64Parsed {
  mimeType: string;
  data: string;
  ext: string;
  uuid: string;
  filename: string;
}

const mimeDB: any = {
  "audio/wav": {
    extensions: "wav",
  },
  "audio/wave": {
    extensions: "wav",
  },
  "video/mp4": {
    extensions: "mp4",
  },
  "image/jpeg": {
    extensions: "jpg",
  },
  "image/png": {
    extensions: "png",
  },
  "audio/webm": {
    extensions: "webm",
  },
};

export function parseBase64(base64: string): Base64Parsed {
  // const [, mimeType, data] = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/) as [
  //     string,
  //     'audio/wav',
  //     string,
  // ];
  const data = base64.split("base64,")[1];
  const mimeType = base64.split(";")[0].replace("data:", "");
  const ext =
    mimeDB[mimeType]?.extensions || mimeType.split("/")[1].split(";")[0];
  const uuid = Uuid();

  return { mimeType, data, ext, uuid, filename: `${uuid}.${ext}` };
}
// export async function uploadFolder(path: string, name: string, container: string = 'seadragon') {
//     const blobService = azure.createBlobService();
//     const files: string[] = await new Promise<string[]>((resolve, reject) => {
//         fsWalk.walk(path, (_, e) => {
//             const data = e
//                 .map(file => {
//                     return file.path;
//                 })
//                 .filter(_ => _.includes('jpeg'));

//             resolve(data);
//         });
//     });
//     return await asyncForEach(files, async (file: string) => {
//         await new Promise<azure.BlobService.BlobResult>((resolve, reject) => {
//             const blob = `${name}${file.replace(path, '')}`;
//             blobService.createBlockBlobFromLocalFile(container, blob, file, (error, result) => {
//                 if (error) {
//                     console.log(error);
//                     reject(error);
//                     return;
//                 }
//                 resolve(result);
//             });
//         });
//     });
// }
export async function createBlogFromText(
  container: string,
  name: string,
  text: string,
  mimeType: string
) {
  const blobService = azure.createBlobService();
  return await new Promise<string>((resolve, reject) => {
    blobService.createBlockBlobFromText(
      container,
      name,
      text,
      {
        contentSettings: {
          contentType: mimeType,
        },
      },
      (error, result) => {
        if (error) {
          console.log(error);
          reject(error);
          return;
        }
        const url = `https://hornbeam.justmaple.app/${result.container}/${result.name}`;
        resolve(url);
      }
    );
  });
}

export async function upLoadBase64({
  data,
  mimeType,
  filename,
}: Base64Parsed): Promise<string> {
  const blobService = azure.createBlobService();
  const buffer = Buffer.from(data, "base64");
  return await new Promise<string>((resolve, reject) => {
    blobService.createBlockBlobFromText(
      "media",
      filename,
      buffer,
      {
        contentSettings: {
          contentType: mimeType,
        },
      },
      (error, result) => {
        if (error) {
          console.log(error);
          reject(error);
          return;
        }
        const url = `https://hornbeam.justmaple.app/${result.container}/${result.name}`;
        resolve(url);
      }
    );
  });
}
