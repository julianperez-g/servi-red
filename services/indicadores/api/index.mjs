import { waitUntil } from "@vercel/functions";
import { crearRuntime } from "../src/runtime.mjs";
import { crearHandlerVercel } from "../src/vercel-handler.mjs";

const { sql, handler } = crearRuntime();

export default crearHandlerVercel({ sql, handler, waitUntil });
