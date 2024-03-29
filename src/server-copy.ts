import cors from "cors";
import express, { Request, Response } from "express";
import expressWs from "express-ws";
import { Server as HTTPServer, createServer } from "http";
import { RawData, WebSocket } from "ws";
import { RetellClient } from "retell-sdk";
import {
  AudioEncoding,
  AudioWebsocketProtocol,
} from "retell-sdk/models/components";
import {
  createContact,
  deleteOneContact,
  getAllContact,
  updateOneContact,
} from "./contacts/contact_controller";
import { connectDb, contactModel, jobModel } from "./contacts/contact_model";
import { TwilioClient } from "./twilio_api";
import { IContact, RetellRequest, callstatusenum } from "./types";
import * as Papa from "papaparse";
import fs from "fs";
import multer from "multer";
// import { scheduleCronJob } from "./queue";
import moment from "moment-timezone";
import { chloeDemoLlmClient } from "./chloe_llm_openai";
import { ethanDemoLlmClient } from "./ethan_llm_openai";
import { danielDemoLlmClient } from "./daniel_llm-openai";
import axios from "axios";
import mongoose from "mongoose";
import { CronJob } from "cron";
import { v4 as uuidv4 } from "uuid";
import cronParser from "cron-parser";
import { jobstatus } from "./types";
let job: CronJob | null = null;
// Define a variable to store the job object globally
connectDb();
export class Server {
  private httpServer: HTTPServer;
  public app: expressWs.Application;
  private retellClient: RetellClient;
  private twilioClient: TwilioClient;

  //multer for file upload
  storage = multer.diskStorage({
    destination: "public/", // Destination directory for uploaded files
    filename: function (req, file, cb) {
      cb(null, file.originalname); // Use original file name
    },
  });
  upload = multer({ storage: this.storage });
  //con
  constructor() {
    this.app = expressWs(express()).app;
    this.httpServer = createServer(this.app);
    this.app.use(express.json());
    this.app.use(cors());
    this.app.use(express.urlencoded({ extended: true }));

    this.handleRetellLlmWebSocket();
    this.handleRegisterCallAPI();
    this.handleContactSaving();
    this.handlecontactDelete();
    this.handlecontactGet();
    this.createPhoneCall();
    this.handleContactUpdate();
    this.uploadcsvToDb();
    this.schedulemycall();
    this.cleardb();
    this.getjobstatus();
    this.updateStatus();
    this.getTimefromcallendly();
    this.getCallLogs();
    this.getAllJobSchedule();
    // this.stopSpecificJob();

    this.retellClient = new RetellClient({
      apiKey: process.env.RETELL_API_KEY,
    });

    this.twilioClient = new TwilioClient();
    this.twilioClient.ListenTwilioVoiceWebhook(this.app);
  }

  listen(port: number): void {
    this.app.listen(port);
    console.log("Listening on " + port);
  }

  handleRegisterCallAPI() {
    this.app.post(
      "/register-call-on-your-server",
      async (req: Request, res: Response) => {
        // Extract agentId from request body; apiKey should be securely stored and not passed from the client
        const { agentId, id } = req.body;

        try {
          const callResponse = await this.retellClient.registerCall({
            agentId: agentId,
            audioWebsocketProtocol: AudioWebsocketProtocol.Web,
            audioEncoding: AudioEncoding.S16le,
            sampleRate: 24000,
          });
          // Send back the successful response to the client
          res.json(callResponse.callDetail);
        } catch (error) {
          console.error("Error registering call:", error);
          // Send an error response back to the client
          res.status(500).json({ error: "Failed to register call" });
        }
      },
    );
  }

  handleRetellLlmWebSocket() {
    this.app.ws(
      "/llm-websocket/:call_id",
      async (ws: WebSocket, req: Request) => {
        const callId = req.params.call_id;
        console.log("Handle llm ws for: ", callId);
        const user = await contactModel.findOne({ callId });

        if (user.agentId === "214e92da684138edf44368d371da764c") {
          console.log("Call started with olivia");
          const oclient = new ethanDemoLlmClient();
          oclient.BeginMessage(ws, user.firstname, user.email);
          ws.on("error", (err) => {
            console.error("Error received in LLM websocket client: ", err);
          });
          ws.on("close", async (err) => {
            await contactModel.findOneAndUpdate(
              { callId },
              { status: callstatusenum.CALLED },
            );
            console.error("Closing llm ws for: ", callId);
          });
          ws.on("message", async (data: RawData, isBinary: boolean) => {
            await contactModel.findOneAndUpdate(
              { callId },
              { status: "on call" },
            );
            console.log(data.toString());
            if (isBinary) {
              console.error("Got binary message instead of text in websocket.");
              ws.close(1002, "Cannot find corresponding Retell LLM.");
            }
            try {
              const request: RetellRequest = JSON.parse(data.toString());
              oclient.DraftResponse(request, ws);
            } catch (err) {
              console.error("Error in parsing LLM websocket message: ", err);
              ws.close(1002, "Cannot parse incoming message.");
            }
          });
        }

        if (user.agentId === "0411eeeb12d17a340941e91a98a766d0") {
          console.log("Call started with chloe");
          const client = new chloeDemoLlmClient();
          client.BeginMessage(ws, user.firstname, user.email);
          ws.on("error", (err) => {
            console.error("Error received in LLM websocket client: ", err);
          });
          ws.on("close", async (err) => {
            await contactModel.findOneAndUpdate(
              { callId },
              { status: callstatusenum.CALLED },
            );
            console.error("Closing llm ws for: ", callId);
          });
          ws.on("message", async (data: RawData, isBinary: boolean) => {
            await contactModel.findOneAndUpdate(
              { callId },
              { status: "on call" },
            );
            console.log(data.toString());
            if (isBinary) {
              console.error("Got binary message instead of text in websocket.");
              ws.close(1002, "Cannot find corresponding Retell LLM.");
            }
            try {
              const request: RetellRequest = JSON.parse(data.toString());
              client.DraftResponse(request, ws);
            } catch (err) {
              console.error("Error in parsing LLM websocket message: ", err);
              ws.close(1002, "Cannot parse incoming message.");
            }
          });
        }

        if (user.agentId === "86f0db493888f1da69b7d46bfaecd360") {
          console.log("Call started with emily");
          const client = new danielDemoLlmClient();
          client.BeginMessage(ws, user.firstname, user.email);
          ws.on("error", (err) => {
            console.error("Error received in LLM websocket client: ", err);
          });
          ws.on("close", async (err) => {
            await contactModel.findOneAndUpdate(
              { callId },
              { status: callstatusenum.CALLED },
            );
            console.error("Closing llm ws for: ", callId);
          });
          ws.on("message", async (data: RawData, isBinary: boolean) => {
            await contactModel.findOneAndUpdate(
              { callId },
              { status: "on call" },
            );
            console.log(data.toString());
            if (isBinary) {
              console.error("Got binary message instead of text in websocket.");
              ws.close(1002, "Cannot find corresponding Retell LLM.");
            }
            try {
              const request: RetellRequest = JSON.parse(data.toString());
              client.DraftResponse(request, ws);
            } catch (err) {
              console.error("Error in parsing LLM websocket message: ", err);
              ws.close(1002, "Cannot parse incoming message.");
            }
          });
        }
      },
    );
  }

  handleContactSaving() {
    this.app.post("/users/create", async (req: Request, res: Response) => {
      const { firstname, lastname, email, phone, agentId } = req.body;
      try {
        const result = await createContact(
          firstname,
          lastname,
          email,
          phone,
          agentId,
        );
        res.json({ result });
      } catch (error) {}
    });
  }

  handlecontactGet() {
    this.app.get("/users/:agentId", async (req: Request, res: Response) => {
      const agentId = req.params.agentId;
      try {
        const result = await getAllContact(agentId);
        res.json({ result });
      } catch (error) {}
    });
  }

  handlecontactDelete() {
    this.app.patch("/users/delete", async (req: Request, res: Response) => {
      const { id } = req.body;
      try {
        const result = await deleteOneContact(id);
        res.json({ result });
      } catch (error) {}
    });
  }

  handleContactUpdate() {
    this.app.patch("/users/update", async (req: Request, res: Response) => {
      try {
        const { id, fields } = req.body;
        if (!fields) {
          return res
            .status(400)
            .json({ error: "No fields to update provided." });
        }
        const result = await updateOneContact(id, fields);
        res.json({ result });
      } catch (error) {
        console.log(error);
        res
          .status(500)
          .json({ error: "An error occurred while updating contact." });
      }
    });
  }

  createPhoneCall() {
    this.app.post(
      "/create-phone-call/:agentId",
      async (req: Request, res: Response) => {
        const { fromNumber, toNumber, userId } = req.body;
        const agentId = req.params.agentId;
        if (!agentId || !fromNumber || !toNumber || !userId) {
          return res.json({ status: "error", message: "Invalid request" });
        }
        try {
          await this.twilioClient.RegisterPhoneAgent(fromNumber, agentId);
          const result = await this.twilioClient.CreatePhoneCall(
            fromNumber,
            toNumber,
            agentId,
            userId,
          );
          res.json({ result });
        } catch (error) {
          console.log(error);
          res.json({
            status: "error",
            message: "Error while creating phone call",
          });
        }
      },
    );
  }

  uploadcsvToDb() {
    this.app.post(
      "/upload/:agentId",
      this.upload.single("csvFile"),
      async (req: Request, res: Response) => {
        try {
          if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
          }
          const csvFile = req.file;
          const csvData = fs.readFileSync(csvFile.path, "utf8");
          Papa.parse(csvData, {
            header: true,
            complete: async (results) => {
              const jsonArrayObj: IContact[] = results.data as IContact[];
              const insertedUsers = [];
              const agentId = req.params.agentId;
              for (const user of jsonArrayObj) {
                // Check if a user with the same email exists for any agent
                const existingUser = await contactModel.findOne({
                  email: user.email,
                });
                if (!existingUser) {
                  // If user doesn't exist for any agent, insert them
                  const userWithAgentId = { ...user, agentId };
                  const insertedUser = await contactModel.create(
                    userWithAgentId,
                  );
                  insertedUsers.push(insertedUser);
                } else {
                  // If user exists, check if it's associated with the current agent
                  if (existingUser.agentId !== agentId) {
                    // If not associated with the current agent, insert them
                    const userWithAgentId = { ...user, agentId };
                    const insertedUser = await contactModel.create(
                      userWithAgentId,
                    );
                    insertedUsers.push(insertedUser);
                  }
                }
              }
              console.log("Upload successful");
              console.log("Inserted users:", insertedUsers);
              res
                .status(200)
                .json({ message: "Upload successful", insertedUsers });
            },
            error: (err: Error) => {
              console.error("Error parsing CSV:", err);
              res.status(500).json({ message: "Failed to parse CSV data" });
            },
          });
        } catch (err) {
          console.error("Error:", err);
          res
            .status(500)
            .json({ message: "Failed to upload CSV data to database" });
        }
      },
    );
  }

  schedulemycall() {
    this.app.post("/schedule", async (req: Request, res: Response) => {
      const { hour, minute, recur, agentId, limit, fromNumber } = req.body;
      let scheduledTimePST;
      let date = moment().tz("America/Los_Angeles");

      // Set the hour and minute for the PST/PDT time
      date.hour(hour);
      date.minute(minute);
      date.second(0); // Set seconds to 0
      date.millisecond(); // Set milliseconds, as in your example

      // Format the date, including the correct offset for PST or PDT
      const formattedDate = date.format("YYYY-MM-DDTHH:mm:ss");
      if (recur) {
        // Recurring cron job pattern: Run daily at the specified hour and minute
        scheduledTimePST = `${minute} ${hour} * * *`;
      } else {
        // Non-recurring cron job pattern: Run once at the specified hour and minute
        const nowPST = moment().tz("America/Los_Angeles");
        const dayOfMonth = nowPST.date();
        const month = nowPST.month() + 1; // Months are zero-based in JavaScript
        scheduledTimePST = `${minute} ${hour} ${dayOfMonth} ${month} *`;
      }
      const { jobId, scheduledTime, job } = await this.schduleCronJob(
        scheduledTimePST,
        agentId,
        limit,
        fromNumber,
        formattedDate,
      );
      res.send({ jobId, scheduledTime, job });
    });
  }

  cleardb() {
    this.app.delete("/cleardb", async (req: Request, res: Response) => {
      const { agentId } = req.body;
      console.log(agentId);
      const result = await contactModel.deleteMany({ agentId });
      res.send(`db cleared sucesffully: ${result}`);
    });
  }

  getjobstatus() {
    this.app.post("/schedules/status", async (req: Request, res: Response) => {
      const { jobId } = req.body;
      const result = await jobModel.findOne({ jobId });
      res.json({ result });
    });
  }

  getAllJobSchedule() {
    this.app.get("/schedules/get", async (req: Request, res: Response) => {
      const result = await jobModel.find().sort({ createdAt: "desc" });
      res.json({ result });
    });
  }

  updateStatus() {
    this.app.post(
      "/users/status/reset",
      async (req: Request, res: Response) => {
        const { agentId } = req.body;
        const result = await contactModel.updateMany(
          { agentId },
          { status: "not called" },
        );
        res.json({ result });
      },
    );
  }

  async schduleCronJob(
    scheduledTimePST: string,
    agentId: string,
    limit: string,
    fromNumber: string,
    formattedDate: string,
  ) {
    const jobId = uuidv4();
    // await jobModel.create({
    //   callstatus: jobstatus.QUEUED,
    //   jobId,
    //   agentId,
    //   scheduledTime: formattedDate,
    // });
    job = new CronJob(
      scheduledTimePST,
      async () => {
        // await jobModel.findOneAndUpdate(
        //   { jobId },
        //   { callstatus: jobstatus.ON_CALL },
        // );

        try {
          const totalContacts = parseInt(limit);
          let processedContacts: number = 0;
          // let contacts = await contactModel
          //   .find({ agentId, status: "not called", isDeleted: { $ne: true } })
          //   .limit(totalContacts);
          let contacts = await contactModel
            .find({ firstname: "Nick", lastname: "Bernadini", agentId })
            .limit(totalContacts);
          for (const contact of contacts.reverse()) {
            try {
              const postdata = {
                fromNumber,
                toNumber: contact.phone,
                userId: contact._id.toString(),
                agentId,
              };
              // await this.twilioClient.RegisterPhoneAgent(fromNumber, agentId);
              // await this.twilioClient.CreatePhoneCall(
              //   postdata.fromNumber,
              //   postdata.toNumber,
              //   postdata.agentId,
              //   postdata.userId,
              // );
              console.log(
                `Axios call successful for contact: ${contact.firstname}`,
              );
            } catch (error) {
              const errorMessage = (error as Error).message || "Unknown error";
              console.error(
                `Error processing contact ${contact.firstname}: ${errorMessage}`,
              );
            }
            await new Promise((resolve) => setTimeout(resolve, 30000));
            processedContacts++;
            if (
              processedContacts >= contacts.length ||
              processedContacts >= totalContacts
            ) {
              break;
            }
          }

          job.stop();
          // await jobModel.findOneAndUpdate(
          //   { jobId },
          //   { callstatus: jobstatus.CALLED },
          // );
          console.log("Cron job stopped successfully.");
          if (!job.running) {
            console.log("Cron job is stopped.");
          } else {
            console.log("Cron job is still running.");
          }
          await jobModel.findOneAndUpdate(
            { jobId },
            { processedContacts: processedContacts },
          );
          await this.searchAndRecallContacts(
            totalContacts,
            agentId,
            fromNumber,
            jobId,
          );
        } catch (error) {
          console.error(
            `Error querying contacts: ${
              (error as Error).message || "Unknown error"
            }`,
          );
        }
      },
      null,
      true,
      "America/Los_Angeles",
    );
    job.start();
    console.log();
    return { jobId, scheduledTime: scheduledTimePST, job };
  }

  async searchAndRecallContacts(
    limit: number,
    agentId: string,
    fromNumber: string,
    jobId: string,
  ) {
    try {
      // const totalContacts = parseInt(limit); // Total number of contacts to be processed /
      let processedContacts = 0;
      let contacts = await contactModel
        .find({ agentId, status: "called-NA-VM", isDeleted: { $ne: true } })
        .limit(limit);
      for (const contact of contacts.reverse()) {
        try {
          const postdata = {
            fromNumber,
            toNumber: contact.phone,
            userId: contact._id.toString(),
            agentId,
          };
          // await this.twilioClient.RegisterPhoneAgent(`fromNumb`er, agentId);
          // await this.twilioClient.CreatePhoneCall(
          //   postdata.fromNumber,
          //   postdata.toNumber,
          //   postdata.agentId,
          //   postdata.userId,
          // );
          console.log(
            `Axios call successful for recalled contact: ${contact.firstname}`,
          );
        } catch (error) {
          const errorMessage = (error as Error).message || "Unknown error";
          console.error(
            `Error processing recalled contact ${contact.firstname}: ${errorMessage}`,
          );
        }
        // Wait for 30 seconds before processing the next contact
        await new Promise((resolve) => setTimeout(resolve, 30000));
        processedContacts++;
        if (
          processedContacts >= contacts.length ||
          processedContacts >= limit
        ) {
          break;
        }
      }
      await jobModel.findOneAndUpdate(
        { jobId },
        { processedContactsForRedial: processedContacts },
      );
      console.log("Recalled contacts processed:", processedContacts);
    } catch (error) {
      console.error("Error searching and recalling contacts:", error);
    }
  }

  stopSpecificJob() {
    this.app.get("/cancel-job", async (req: Request, res: Response) => {
      // Check if job object exists
      // const job: CronJob | null = req.body.job;
      if (job) {
        // Stop the job
        job.stop();
        console.log("Cron job cancelled successfully.");
        res.send("Cron job cancelled successfully.");
      } else {
        console.log("No cron job to cancel.");
        res.status(400).send("No cron job to cancel.");
      }
    });
  }
  getCallLogs() {
    this.app.get("/call-logs", async (req: Request, res: Response) => {
      const { agentId } = req.body;
      const result = await jobModel.find({ agentId });
      res.json({ result });
    });
  }

  // getTimefromcallendly() {
  //   this.app.get("/calender", async (req: Request, res: Response) => {
  //     try {
  //       const response = await axios.get(
  //         `https://api.calendly.com/user_availability_schedules`,
  //         {
  //           params: {
  //             user: process.env.CALLENDY_URI,
  //           },
  //           headers: {
  //             "Content-Type": "application/json",
  //             Authorization: `Bearer ${process.env.CALLENDY_API}`,
  //           },
  //         },
  //       );

  //       const availableDaysAndTimes: string[] = [];
  //       response.data.collection.forEach((schedule: any) => {
  //         schedule.rules.forEach((rule: any) => {
  //           if (rule.intervals.length > 0) {
  //             rule.intervals.forEach((interval: any) => {
  //               const formattedTime = `${rule.wday} at ${interval.from} to ${interval.to}`;
  //               availableDaysAndTimes.push(formattedTime);
  //             });
  //           }
  //         });
  //       });

  //       // Combine multiple days and times into a single string
  //       const formattedResponse = availableDaysAndTimes.join(" or ");

  //       res.send(formattedResponse); // Sending the formatted response
  //     } catch (error) {
  //       console.error(
  //         "Error fetching availability schedules from Calendly:",
  //         error,
  //       );
  //       res.status(500).json({ error: "Internal Server Error" }); // Sending an error response
  //     }
  //   });
  // }

  getTimefromcallendly() {
    this.app.get("/calender", async (req: Request, res: Response) => {
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

        const availableTimes: string[] = [];
        response.data.collection.forEach((schedule: any) => {
          schedule.rules.forEach((rule: any) => {
            if (rule.intervals.length > 0) {
              const firstInterval = rule.intervals[0]; // Get the first interval
              const startTime = firstInterval.from; // Extract the start time
              availableTimes.push(`${rule.wday} at ${startTime}`);
            }
          });
        });

        // Combine multiple days and times into a single string
        const formattedResponse = availableTimes.join(" or ");

        res.send(formattedResponse); // Sending the formatted response
      } catch (error) {
        console.error(
          "Error fetching availability schedules from Calendly:",
          error,
        );
        res.status(500).json({ error: "Internal Server Error" }); // Sending an error response
      }
    });
  }
}
