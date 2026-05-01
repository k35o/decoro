import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { z } from 'zod';

const buttonProps = z.object({
  label: z.string().describe('Visible button text.'),
  type: z.enum(['button', 'submit']).nullable(),
  size: z.enum(['sm', 'md', 'lg']).nullable(),
  color: z.enum(['primary', 'secondary', 'gray']).nullable(),
  variant: z.enum(['contained', 'outlined', 'skeleton']).nullable(),
  fullWidth: z.boolean().nullable(),
  disabled: z.boolean().nullable(),
});

const cardProps = z.object({
  width: z.enum(['full', 'fit']).nullable(),
  appearance: z.enum(['shadow', 'bordered']).nullable(),
});

export const catalog = defineCatalog(schema, {
  components: {
    Button: {
      props: buttonProps,
      slots: [],
      description:
        'Standard ArteOdyssey button. Use for actions; the visible text comes from `label`. Pick `color` and `variant` based on prominence.',
    },
    Card: {
      props: cardProps,
      slots: ['default'],
      description:
        'Container for grouping content. Use `appearance: "bordered"` when stacking multiple cards on the same surface, otherwise leave the default shadow.',
    },
  },
  actions: {},
});

export type ButtonProps = z.infer<typeof buttonProps>;
export type CardProps = z.infer<typeof cardProps>;
