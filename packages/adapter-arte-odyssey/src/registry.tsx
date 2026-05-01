import type {
  ComponentRegistry,
  ComponentRenderProps,
} from '@json-render/react';
import { Button, Card } from '@k8o/arte-odyssey';
import { createElement } from 'react';

import type { ButtonProps, CardProps, LayoutElementProps } from './catalog.ts';

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

/**
 * Renderer factory for layout HTML elements (per ADR-012). The Catalog Zod
 * refinement has already validated `className` against the allowlist, so the
 * renderer just forwards it. `displayName` is set so React devtools shows
 * `divRenderer` etc. instead of an anonymous component.
 */
const layoutElementRenderer = (tag: string) => {
  const renderer = ({
    element,
    children,
  }: ComponentRenderProps<LayoutElementProps>) =>
    createElement(
      tag,
      { className: element.props.className ?? undefined },
      children,
    );
  renderer.displayName = `${tag}Renderer`;
  return renderer;
};

export const registry: ComponentRegistry = {
  Button: ButtonRenderer,
  Card: CardRenderer,
  div: layoutElementRenderer('div'),
  section: layoutElementRenderer('section'),
  header: layoutElementRenderer('header'),
  main: layoutElementRenderer('main'),
};
