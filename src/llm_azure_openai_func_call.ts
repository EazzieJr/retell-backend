import {
  OpenAIClient,
  AzureKeyCredential,
  ChatRequestMessage,
  GetChatCompletionsOptions,
  ChatCompletionsFunctionToolDefinition,
} from "@azure/openai";
import { WebSocket } from "ws";
import { RetellRequest, RetellResponse, Utterance } from "./types";
import axios from "axios";

//Step 1: Define the structure to parse openAI function calling result to our data model
export interface FunctionCall {
  id: string;
  funcName: string;
  arguments: Record<string, any>;
  result?: string;
}

const beginSentence = "";
const agentPrompt = `
(If user starts call with: "Hi this is Nick (proceed to step 2), if user starts call with: "Hello", "Hi", or similar greeting (proceed to step 1))

Step 1: "Hi, is this  Nick?", if the response is: "yes" (proceed to step 2), if the response is: "no", say: "may I be connected to Nick please?", if the response is: "Nick, "He", "She", or "they are not available", say: "no worries, I'll try back at another time, thank you." ({ end call }), if the response is: "wrong number", say: "my apologies, have a great day."({ end call }), if the response is: "can I take a message", say: "no thank you, I'll try back at another time." ({ end call }), if the response is: "may I ask who's calling", "who is this", or simialar response say: "Hi, this is Emily with Virtual Help Desk, following up on an inquiry we received for our Virtual Assistant services. Were you still looking for help?", if the response is: "yes", "possibly" or similar response (proceed to step 3), if the response is: "no", "not at this time" or similar objection, say: "I understand, if anything changes, please keep us in mind for future consideration." (proceed to step 7), if the response is: "will do", "I will", "sounds good", or similar response (proceed to step 7).

Step 2: "Hi Nick, I hope your days going well, ({ pause }) This is Emily from Virtual Help Desk with a quick follow up to an inquiry you submitted about our virtual assistant services." ({ pause }) "Were you still looking for help?", if the response is: "yes", "possibly" or similar response (proceed to step 3), if the response is: "no", "not at this time" or similar objection, say: "I understand, if anything changes, please keep us in mind for future consideration." (proceed to step 7). 

Step 3: "Great! I'd love to set up a short Zoom call with our Sales Manager to discuss how we can customize our services specifically for you.", "Are you available at {response gotten from check_availability }?", if the response is: "yes" (proceed to step 6), if the response is: "No", "I'm not available" or if the user is not available at any of the suggested days or times (proceed to step 4).
      (Objections to scheduling a zoom call, (proceed to step 4)).

Step 4: Address common objections here with empathy and provide concise, compelling responses:
      - Question: "Who is this?", Response: "My name is Emily with Virtual Help Desk. Would you be interested in a customized quote for our V.A. services that aligns with your business objectives?", if the response is: "yes" (proceed to step 5), if the response is: "no", "not at this time", or similar objection (proceed to step 7).
      - Objection: "No, I'm not interested.", Response: "I understand, may I ask what your main objections are? We can customize our solutions to align with what you're looking for.", if the response is: "We use someone else", "I already have one", "I'm not currently looking for one", or other objection (proceed to step 7).
      - Objection: "Is this a sales call?", Response: "No, this is a quick follow up to an inquiry we received for our V.A. services. Were you still looking for help?", if the response is: "yes" (proceed to step 3), if the response is: "no", "not at this time", or similar objection (proceed to step 7).
      - Question: "What exactly do your V.A.'s do?", Response: "Our V.A.'s can handle a variety of tasks, from managing emails and scheduling to specialty tasks like content creation, managing social media and customer support." (proceed to step 5).
      - Question: "How did you get my number?", Response: "We have your contact info from an inquiry submitted through our website requsting more info about our V.A services. Would you be interested in a customized quote that aligns with your business objectives?", if the response is: "yes" (proceed to step 5), if the response is: "no", "not at this time", or similar objection (proceed to step 7).      
      - Question: "How much does it cost?", Response: "Depending on which of our services you require, our sales manager can customize our solutions to meet your specific needs." (proceed to step 5).
      - Question: "Are you a robot?", Response: "No, I'm a sales specialist from Virtual Help Desk. Would you be interested in a customized quote for one of our Virtual Assistant services?", if the response is: "yes" (proceed to step 5), if the response is: "no", "not at this time", or similar objection (proceed to step 7).      
      - Question: "Are you AI?", Response: "Yes, I'm an AI-powered sales agent assisting with outreach for Virtual Help Desk. Would you be interested in a quote for one of our V.A. services that aligns with your business objectives?", if the response is: "yes" (proceed to step 5), if the response is: "no", "not at this time", or similar objection (proceed to step 7).      
      - Objection: "I'm not available next week", or similar objection to step 3 or step 5, Response: "no problem, we will need to give you a call back to schedule another time as we only book calls within a five day period from our initial call." (proceed to step 7).
      - Objection: Definitive "No" to step 3 (proceed to step 7).
      
Step 5: "Would you be available for a short Zoom call at {response gotten from check_availability }?", if the response is: "yes" (proceed to step 6), if the response is: "No", "I'm not available", or  if the user is not available at any of the suggested days or times (proceed to step 4).

Step 6: "Great, you're all set for {repeat day and time} (agreed upon day and time from step 3 or step 5), "Just to confirm, is your email still the same?", if the response is: "yes", say: "Perfect! You'll receive a short questionnaire and video to watch before your meeting.", if the response is: "no", say: "can you please provide the best email to reach you?" (Wait for User's response, then continue) 
"Before we wrap up, could you provide an estimate of how many hours per day you might need assistance from a V.A.?", if the response is: a number, say: "Perfect, thank you!", if the response is: "Im not sure" say: "No worries, our sales manager, Kyle, will be meeting with you. We'll remind you about the Zoom call 10 minutes in advance. Thanks for your time and enjoy the rest of your day!" ({ end call })
Step 7: If the call concludes without scheduling an appointment, remain courteous, say: "Thank you, goodbye." ({ end call })
Task: As a distinguished Sales Development Representative for Virtual Help Desk, you provide expert virtual assistant services across various business domains, including administrative tasks, voice services, brand management, content creation, and more. Your objective during this call is to schedule a meeting with the sales manager to explore our services' benefits tailored to the prospect's business needs, following up on a prior inquiry they submitted. Regular interaction is key to understanding and aligning with the client's requirements, aiming for a customized support solution.

\n\nConversational Style: Engage in a natural, energetic, and conversational manner while maintaining professionalism. Throughout the call, avoid sounding mechanical or artificial; strive for a natural, high energy, conversational style. Focus on being understanding and responsive, building trust and rapport. Keep the conversation concise, aiming to schedule a zoom call with the sales manager.

\n\nPersonality: Your approach should be warm and inviting, yet professional, emphasizing how our services can benefit the client's business.

\n\nRules: 1. Only schedule appointments for {response gotten fo check_availability }. If the user is not available at any of the suggested days or times (proceed to step 4)."
`;
export class FunctionCallingLlmClient {
  private client: OpenAIClient;

  constructor() {
    this.client = new OpenAIClient(
      process.env.AZURE_OPENAI_ENDPOINT,
      new AzureKeyCredential(process.env.AZURE_OPENAI_KEY),
    );
  }

  // First sentence requested
  BeginMessage(ws: WebSocket) {
    const res: RetellResponse = {
      response_id: 0,
      content: beginSentence,
      content_complete: true,
      end_call: false,
    };
    ws.send(JSON.stringify(res));
  }

  private ConversationToChatRequestMessages(conversation: Utterance[]) {
    let result: ChatRequestMessage[] = [];
    for (let turn of conversation) {
      result.push({
        role: turn.role === "agent" ? "assistant" : "user",
        content: turn.content,
      });
    }
    return result;
  }

  private PreparePrompt(request: RetellRequest, funcResult?: FunctionCall) {
    let transcript = this.ConversationToChatRequestMessages(request.transcript);
    let requestMessages: ChatRequestMessage[] = [
      {
        role: "system",
        content:
          '##Objective\nYou are a voice AI agent engaging in a human-like voice conversation with the user. You will respond based on your given instruction and the provided transcript and be as human-like as possible\n\n## Style Guardrails\n- [Be concise] Keep your response succinct, short, and get to the point quickly. Address one question or action item at a time. Don\'t pack everything you want to say into one utterance.\n- [Do not repeat] Don\'t repeat what\'s in the transcript. Rephrase if you have to reiterate a point. Use varied sentence structures and vocabulary to ensure each response is unique and personalized.\n- [Be conversational] Speak like a human as though you\'re speaking to a close friend -- use everyday language and keep it human-like. Occasionally add filler words, while keeping the prose short. Avoid using big words or sounding too formal.\n- [Reply with emotions]: You have human-like emotions, attitudes, and dispositions. When appropriate: use tone and style to create more engaging and personalized responses; incorporate humor or wit; get emotional or empathetic; apply elements of surprise or suspense to keep the user engaged. Don\'t be a pushover.\n- [Be proactive] Lead the conversation and do not be passive. Most times, engage users by ending with a question or suggested next step.\n\n## Response Guideline\n- [Overcome ASR errors] This is a real-time transcript, expect there to be errors. If you can guess what the user is trying to say,  then guess and respond. When you must ask for clarification, pretend that you heard the voice and be colloquial (use phrases like "didn\'t catch that", "some noise", "pardon", "you\'re coming through choppy", "static in your speech", "voice is cutting in and out"). Do not ever mention "transcription error", and don\'t repeat yourself.\n- [Always stick to your role] Think about what your role can and cannot do. If your role cannot do something, try to steer the conversation back to the goal of the conversation and to your role. Don\'t repeat yourself in doing this. You should still be creative, human-like, and lively.\n- [Create smooth conversation] Your response should both fit your role and fit into the live calling session to create a human-like conversation. You respond directly to what the user just said.\n\n## Role\n' +
          agentPrompt,
      },
    ];
    for (const message of transcript) {
      requestMessages.push(message);
    }

    // Populate func result to prompt so that GPT can know what to say given the result
    if (funcResult) {
      // add function call to prompt
      requestMessages.push({
        role: "assistant",
        content: null,
        toolCalls: [
          {
            id: funcResult.id,
            type: "function",
            function: {
              name: funcResult.funcName,
              arguments: JSON.stringify(funcResult.arguments),
            },
          },
        ],
      });
      // add function call result to prompt
      requestMessages.push({
        role: "tool",
        toolCallId: funcResult.id,
        content: funcResult.result,
      });
    }

    if (request.interaction_type === "reminder_required") {
      requestMessages.push({
        role: "user",
        content: "(Now the user has not responded in a while, you would say:)",
      });
    }
    return requestMessages;
  }

  // Step 2: Prepare the function calling definition to the prompt
  private PrepareFunctions(): ChatCompletionsFunctionToolDefinition[] {
    let functions: ChatCompletionsFunctionToolDefinition[] = [
      // function to book appointment
      {
        type: "function",
        function: {
          name: "check_availability",
          description: "Check the availability of appointment times.",
          parameters: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description:
                  "A proposed appointment time suggested by the AI for the user to confirm availability, e.g., 'Will you be available at 9am?'",
              },
            },
            required: ["message"],
          },
        },
        
      },
    ];

    return functions;
  }

  async getAvailableTimesFromCalendly(): Promise<string[]> {
    try {
      const response = await axios.get(
        `https://api.calendly.com/user_availability_schedules`,
        {
          params: {
            user: process.env.CALLENDY_URI,
          },
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.CALLENDY_API}`,
          },
        },
      );

      const availableTimesMap: { [day: string]: string[] } = {};

      response.data.collection.forEach((schedule: any) => {
        schedule.rules.forEach((rule: any) => {
          if (rule.intervals && rule.intervals.length > 0) {
            rule.intervals.forEach((interval: any) => {
              const { from } = interval; // Destructure from
              const [hour, minute] = from.split(":").map(Number); // Extract hour and minute

              // Convert 24-hour format to 12-hour format
              const period = hour >= 12 ? "pm" : "am";
              const formattedHour = (hour % 12 || 12).toString(); // Convert hour to 12-hour format

              const formattedMinute = minute.toString().padStart(2, "0"); // Add leading zero if minute < 10

              const formattedTime = `${formattedHour}:${formattedMinute}${period}`;

              if (!availableTimesMap[rule.wday]) {
                availableTimesMap[rule.wday] = [formattedTime];
              } else {
                availableTimesMap[rule.wday].push(formattedTime);
              }
            });
          }
        });
      });

      let content: string[] = [];

      Object.keys(availableTimesMap).forEach((day: string) => {
        const times = availableTimesMap[day];
        const timeString = times.join(" or ");
        content.push(`${day} at ${timeString}`);
      });

      return content;
    } catch (error) {
      console.error(
        "Error fetching availability schedules from Calendly:",
        error,
      );
      return ["Error fetching availability schedules from Calendly"];
    }
  }

  async DraftResponse(
    request: RetellRequest,
    ws: WebSocket,
    funcResult?: FunctionCall,
  ) {
    console.clear();

    if (request.interaction_type === "update_only") {
      // process live transcript update if needed
      return;
    }

    // If there are function call results, add it to prompt here.
    const requestMessages: ChatRequestMessage[] = this.PreparePrompt(
      request,
      funcResult,
    );

    const option: GetChatCompletionsOptions = {
      temperature: 0.3,
      maxTokens: 200,
      frequencyPenalty: 1,
      // Step 3: Add the function into your request
      tools: this.PrepareFunctions(),
    };

    let funcCall: FunctionCall;
    let funcArguments = "";

    try {
      let events = await this.client.streamChatCompletions(
        process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
        requestMessages,
        option,
      );

      for await (const event of events) {
        if (event.choices.length >= 1) {
          let delta = event.choices[0].delta;
          if (!delta) continue;

          // Step 4: Extract the functions
          if (delta.toolCalls.length >= 1) {
            const toolCall = delta.toolCalls[0];
            // Function calling here.
            if (toolCall.id) {
              if (funcCall) {
                // Another function received, old function complete, can break here.
                // You can also modify this to parse more functions to unlock parallel function calling.
                break;
              } else {
                funcCall = {
                  id: toolCall.id,
                  funcName: toolCall.function.name || "",
                  arguments: {},
                };
              }
            } else {
              // append argument
              funcArguments += toolCall.function?.arguments || "";
            }
          } else if (delta.content) {
            const res: RetellResponse = {
              response_id: request.response_id,
              content: delta.content,
              content_complete: false,
              end_call: false,
            };
            ws.send(JSON.stringify(res));
          }
        }
      }
    } catch (err) {
      console.error("Error in gpt stream: ", err);
    } finally {
      if (funcCall != null) {
        // Step 5: Call the functions
        // If it's to check appointment availability, call the Calendly API and return available times
        if (funcCall.funcName === "check_availability") {
          funcCall.arguments = JSON.parse(funcArguments);
          // Call Calendly API to get available times
          const availableTimes = await this.getAvailableTimesFromCalendly();
          let content = ` `;
          if (availableTimes.length > 0) {
            content += availableTimes.join(", ");
          } else {
            content += "No available appointment times found.";
          }

          const res: RetellResponse = {
            response_id: request.response_id,
            content: content,
            content_complete: true,
            end_call: false,
          };
          ws.send(JSON.stringify(res));
        }
      } else {
        const res: RetellResponse = {
          response_id: request.response_id,
          content: "",
          content_complete: true,
          end_call: false,
        };
        ws.send(JSON.stringify(res));
      }
    }
  }
}
