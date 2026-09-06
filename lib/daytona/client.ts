import { Daytona } from "@daytona/sdk";

if (!process.env.DAYTONA_API_KEY) {
  throw new Error("Missing Daytona API key");
}

export const daytonaClient = new Daytona();