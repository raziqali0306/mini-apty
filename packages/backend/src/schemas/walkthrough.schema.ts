import { z } from 'zod';

const triggerKinds = ['next-button', 'click-target', 'input-change'] as const;

// Opaque but non-empty: the extension owns the descriptor's internal shape.
const targetDescriptorSchema = z
  .record(z.string(), z.unknown())
  .refine((obj) => Object.keys(obj).length > 0, 'Target descriptor must not be empty');

const advanceTriggerSchema = z.object({
  kind: z.enum(triggerKinds),
  target: targetDescriptorSchema.optional(),
});

const stepSchema = z.object({
  order: z.number().int().nonnegative(),
  title: z.string().min(1, 'Step title is required'),
  description: z.string().default(''),
  target: targetDescriptorSchema,
  advanceTrigger: advanceTriggerSchema,
});

// PUT replaces the editable fields, so create/update share one body schema.
export const walkthroughBodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  origin: z.string().min(1, 'Origin is required'),
  pathPattern: z.string().min(1, 'Path pattern is required'),
  steps: z.array(stepSchema).min(1, 'At least one step is required'),
});

export const listQuerySchema = z.object({
  origin: z.string().min(1, 'origin query param is required'),
  path: z.string().optional(),
});

export type WalkthroughBody = z.infer<typeof walkthroughBodySchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
