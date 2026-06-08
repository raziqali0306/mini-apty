import mongoose, { type HydratedDocument, type Model } from 'mongoose';

// Access Schema/model/models off the default import: mongoose is CJS and Node's
// ESM interop doesn't expose all of them as named exports (e.g. `models`).
const { Schema, model } = mongoose;

export interface User {
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<User>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        const r = ret as Record<string, unknown>;
        r.id = String(r._id);
        delete r._id;
        delete r.__v;
        delete r.passwordHash;
        return r;
      },
    },
  },
);

export type UserDocument = HydratedDocument<User>;

// Guard against re-registration (test workers / hot reload).
export const UserModel: Model<User> =
  (mongoose.models.User as Model<User> | undefined) ?? model<User>('User', userSchema);
