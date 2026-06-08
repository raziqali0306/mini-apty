import mongoose, { type HydratedDocument, type Model, type Types } from 'mongoose';

// mongoose is CJS — access Schema/model/Types off the default import.
const { Schema, model } = mongoose;

/**
 * The element-targeting descriptor is owned and finalized by the extension's
 * targeting milestone; the backend stores it as an opaque object (validated as
 * a non-empty record at the Zod boundary) so the API stays decoupled from its
 * internal shape.
 */
export type TargetDescriptor = Record<string, unknown>;

export type AdvanceTriggerKind = 'next-button' | 'click-target' | 'input-change';

export interface AdvanceTrigger {
  kind: AdvanceTriggerKind;
  target?: TargetDescriptor;
}

export interface Step {
  order: number;
  title: string;
  description: string;
  target: TargetDescriptor;
  advanceTrigger: AdvanceTrigger;
}

export interface Walkthrough {
  name: string;
  origin: string;
  pathPattern: string;
  owner: Types.ObjectId;
  version: number;
  steps: Step[];
  createdAt: Date;
  updatedAt: Date;
}

const advanceTriggerSchema = new Schema<AdvanceTrigger>(
  {
    kind: { type: String, enum: ['next-button', 'click-target', 'input-change'], required: true },
    target: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const stepSchema = new Schema<Step>(
  {
    order: { type: Number, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    target: { type: Schema.Types.Mixed, required: true },
    advanceTrigger: { type: advanceTriggerSchema, required: true },
  },
  { _id: false },
);

const walkthroughSchema = new Schema<Walkthrough>(
  {
    name: { type: String, required: true },
    origin: { type: String, required: true },
    pathPattern: { type: String, required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    version: { type: Number, default: 1 },
    steps: { type: [stepSchema], default: [] },
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
        if (r.owner !== undefined) r.owner = String(r.owner);
        return r;
      },
    },
  },
);

// List queries filter by owner + origin.
walkthroughSchema.index({ owner: 1, origin: 1 });

export type WalkthroughDocument = HydratedDocument<Walkthrough>;

export const WalkthroughModel: Model<Walkthrough> =
  (mongoose.models.Walkthrough as Model<Walkthrough> | undefined) ??
  model<Walkthrough>('Walkthrough', walkthroughSchema);
