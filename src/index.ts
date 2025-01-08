import { app } from "@azure/functions";
import { connectToDatabase } from "./lib/mongo";

connectToDatabase();
app.setup({
  enableHttpStream: true,
});
