import type { Request, RequestHandler } from 'express';
import { walkthroughBodySchema, listQuerySchema } from '../schemas/walkthrough.schema';
import * as walkthroughService from '../services/walkthrough.service';
import { unauthorized } from '../lib/app-error';

/** Routes are behind `authenticate`, so userId is present; assert for the types. */
function ownerId(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}

export const create: RequestHandler = async (req, res) => {
  const input = walkthroughBodySchema.parse(req.body);
  const doc = await walkthroughService.create(ownerId(req), input);
  res.status(201).json(doc);
};

export const list: RequestHandler = async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const docs = await walkthroughService.list(ownerId(req), query);
  res.json(docs);
};

export const getById: RequestHandler = async (req, res) => {
  const doc = await walkthroughService.getById(ownerId(req), req.params.id);
  res.json(doc);
};

export const update: RequestHandler = async (req, res) => {
  const input = walkthroughBodySchema.parse(req.body);
  const doc = await walkthroughService.update(ownerId(req), req.params.id, input);
  res.json(doc);
};

export const remove: RequestHandler = async (req, res) => {
  await walkthroughService.remove(ownerId(req), req.params.id);
  res.status(204).send();
};
