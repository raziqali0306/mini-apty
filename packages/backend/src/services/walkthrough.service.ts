import mongoose from 'mongoose';
import { WalkthroughModel, type WalkthroughDocument } from '../models/walkthrough.model';
import { forbidden, notFound } from '../lib/app-error';
import type { ListQuery, WalkthroughBody } from '../schemas/walkthrough.schema';

export function create(ownerId: string, input: WalkthroughBody): Promise<WalkthroughDocument> {
  return WalkthroughModel.create({ ...input, owner: new mongoose.Types.ObjectId(ownerId) });
}

export async function list(ownerId: string, query: ListQuery): Promise<WalkthroughDocument[]> {
  const docs = await WalkthroughModel.find({ owner: ownerId, origin: query.origin }).sort({
    updatedAt: -1,
  });
  const { path } = query;
  if (path === undefined) return docs;
  // Match the concrete path against each stored wildcard pattern in-process —
  // the per-user/per-origin set is small, and this keeps matching out of Mongo.
  return docs.filter((doc) => patternToRegExp(doc.pathPattern).test(path));
}

export function getById(ownerId: string, id: string): Promise<WalkthroughDocument> {
  return loadOwned(ownerId, id);
}

export async function update(
  ownerId: string,
  id: string,
  input: WalkthroughBody,
): Promise<WalkthroughDocument> {
  const doc = await loadOwned(ownerId, id);
  doc.set(input);
  doc.version += 1;
  await doc.save();
  return doc;
}

export async function remove(ownerId: string, id: string): Promise<void> {
  const doc = await loadOwned(ownerId, id);
  await doc.deleteOne();
}

/** Load a walkthrough enforcing ownership: 404 if absent, 403 if not the owner. */
async function loadOwned(ownerId: string, id: string): Promise<WalkthroughDocument> {
  if (!mongoose.isValidObjectId(id)) throw notFound('Walkthrough not found');
  const doc = await WalkthroughModel.findById(id);
  if (!doc) throw notFound('Walkthrough not found');
  if (doc.owner.toString() !== ownerId) {
    throw forbidden('You do not have access to this walkthrough');
  }
  return doc;
}

/** Turn a stored path pattern (`*` = one path segment) into an anchored regex. */
function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withWildcard = escaped.replace(/\\\*/g, '[^/]*');
  return new RegExp(`^${withWildcard}$`);
}
