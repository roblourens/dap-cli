import { z } from 'zod';

export const dapCliHomeSchema = z.string().min(1);
