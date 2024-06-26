import OpenAI from "openai";


const client = new OpenAI({
    apiKey: process.env.OPENAI_APIKEY,
  });

  export const reviewTranscript = async (transcript: string) => {
    try {
      const completion = await client.chat.completions.create({
        messages: [
          {"role": "system", "content": "You are a helpful assistant."},
          {"role": "user", "content": `Please categorize the following interactions into the categories: Uninterested, Interested, Scheduled, Voicemail, Incomplete call, Call back. Just go straight to the point and respond with only the option, if an empty string is giving or nothing is passed as the transcript return "No Analyzed Transcript available" Transcript: ${transcript}`}
        ],
        // model: "gpt-4-turbo-preview",
        model:"gpt-4o",
      });
  
      return completion.choices[0];
    } catch (error) {
      console.error("Error analyzing transcript:", error);
      throw new Error("Failed to analyze transcript");
    }
  };