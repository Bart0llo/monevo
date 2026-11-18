import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Adds `.openapi()` metadata to every Zod schema (api-design.md#1-principles).
extendZodWithOpenApi(z);

export { z };
