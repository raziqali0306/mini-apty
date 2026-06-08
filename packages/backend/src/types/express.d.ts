// Augments Express's Request with the authenticated user id set by the
// `authenticate` middleware. Optional because it's absent on public routes.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export {};
