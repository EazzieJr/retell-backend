import { model, Schema } from "mongoose";
import argon2 from "argon2";

const userSchema = new Schema(
  {
    email: {
      type: String,
      unique: true,
      required: [true, "provide an email"],
    },
    password: {
      type: String,
      required: [true, "provide a password"],
    },
    username: {
      type: String,
      required: true,
    },
    group: {
      type: String,
      enum: ["BE+WELL", "TVAG"],
      required: [true, "provide a group"],
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    agents:{
        type:[
            {
                name: String,
                agentId: String,
                alias:String
            }
        ]
    },
    passwordHash: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);
userSchema.pre("save", async function () {
  this.passwordHash = await argon2.hash(this.password);
});
export const userModel = model("User", userSchema);
