export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); } catch (e) {
    if (spec.startsWith('.') && !spec.endsWith('.ts')) {
      try { return await next(spec + '.ts', ctx); } catch { return next(spec + '/index.ts', ctx); }
    }
    throw e;
  }
}
