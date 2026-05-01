import type {
  ComponentRegistry,
  ComponentRenderProps,
} from '@json-render/react';
import { Button, Card } from '@k8o/arte-odyssey';

import type { ButtonProps, CardProps } from './catalog.ts';

const ButtonRenderer = ({ element }: ComponentRenderProps<ButtonProps>) => {
  const { label, type, size, color, variant, fullWidth, disabled } =
    element.props;
  return (
    <Button
      type={type ?? undefined}
      size={size ?? undefined}
      color={color ?? undefined}
      variant={variant ?? undefined}
      fullWidth={fullWidth ?? undefined}
      disabled={disabled ?? undefined}
    >
      {label}
    </Button>
  );
};

const CardRenderer = ({
  element,
  children,
}: ComponentRenderProps<CardProps>) => {
  const { width, appearance } = element.props;
  return (
    <Card width={width ?? undefined} appearance={appearance ?? undefined}>
      {children}
    </Card>
  );
};

export const registry: ComponentRegistry = {
  Button: ButtonRenderer,
  Card: CardRenderer,
};
