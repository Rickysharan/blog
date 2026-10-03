import { z } from "zod";

import { requireStudioOperator } from "../../../../lib/auth/operator";
import { contentError, privateJson } from "../../../../lib/content/repository";
import { ContentRequestError, readBoundedJson, requireSameOrigin } from "../../../../lib/http/same-origin";
import { completeTask, postponeTask } from "../../../../lib/tasks/repository";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid();
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete") }).strict(),
  z.object({ action: z.literal("postpone"), postponedUntil: z.iso.datetime() }).strict(),
]);

export async function PATCH(request: Request, context: Context) {
  try {
    await requireStudioOperator();
    requireSameOrigin(request);
    const id = idSchema.safeParse((await context.params).id);
    const action = actionSchema.safeParse(await readBoundedJson(request));
    if (!id.success || !action.success) throw new ContentRequestError(400, "invalid_input", "A valid task action is required.");
    let task;
    if (action.data.action === "complete") {
      task = await completeTask(id.data);
    } else {
      const until = new Date(action.data.postponedUntil);
      if (until.getTime() <= Date.now() || until.getTime() > Date.now() + 366 * 86_400_000) {
        throw new ContentRequestError(400, "invalid_input", "Choose a future postponement within one year.");
      }
      task = await postponeTask(id.data, action.data.postponedUntil);
    }
    return privateJson({ task });
  } catch (error) {
    return contentError(error);
  }
}
