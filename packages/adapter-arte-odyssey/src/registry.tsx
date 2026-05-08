import type {
  ComponentRegistry,
  ComponentRenderProps,
} from '@json-render/react';
import * as arteOdyssey from '@k8o/arte-odyssey';
import {
  Alert,
  Button,
  Card,
  Drawer,
  FormControl,
  IconButton,
  LinkButton,
  Modal,
  Pagination,
} from '@k8o/arte-odyssey';
import { type ComponentType, createElement } from 'react';

import type {
  AlertProps,
  ButtonProps,
  CardProps,
  DrawerProps,
  FormControlProps,
  IconButtonProps,
  IconProps,
  LayoutElementProps,
  LinkButtonProps,
  ModalProps,
  PaginationProps,
  TextProps,
} from './catalog.ts';
import { generatedRegistry } from './registry.generated.tsx';

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

const AlertRenderer = ({ element }: ComponentRenderProps<AlertProps>) => (
  <Alert status={element.props.status} message={element.props.message} />
);

/**
 * FormControl uses a `renderInput` render prop in ArteOdyssey so it can
 * inject ARIA wiring (id, labelId, describedbyId) into its child input. Our
 * spec model produces children as already-rendered React nodes by the time
 * the registry sees them, so we cannot thread the injected props back into
 * those children — accept the ARIA-degraded path and just render children
 * inside the callback. The wrapping label / helpText / errorText still
 * appear correctly.
 */
const FormControlRenderer = ({
  element,
  children,
}: ComponentRenderProps<FormControlProps>) => {
  const { label, helpText, errorText, isDisabled, isInvalid, isRequired } =
    element.props;
  return (
    <FormControl
      label={label}
      helpText={helpText ?? undefined}
      errorText={errorText ?? undefined}
      isDisabled={isDisabled ?? false}
      isInvalid={isInvalid ?? false}
      isRequired={isRequired ?? false}
      // ARIA wiring degrades here — see comment above. Children are
      // pre-rendered React nodes by the time we get them.
      // oxlint-disable-next-line eslint-plugin-react(jsx-no-useless-fragment)
      renderInput={() => <>{children}</>}
    />
  );
};

/**
 * Stateful overlay / pagination components in ArteOdyssey require callback
 * props (`onClose`, `onPageChange`) that the spec model has no way to
 * express. For the **preview path** we install no-op defaults so the
 * component renders; the **codegen path** emits matching TODO callbacks
 * that the user wires up in their own codebase.
 *
 * Drawer / Modal also take `isOpen`, which the LLM often resolves to a
 * `$state` binding pointing at app state that does not exist in the preview
 * sandbox. To keep the preview useful (showing the rendered content rather
 * than an invisible overlay) we **force `isOpen=true` in the registry**.
 * Codegen still emits whatever the spec said so the user sees the intended
 * binding in their generated TSX.
 */
const noop = () => {};

const DrawerRenderer = ({
  element,
  children,
}: ComponentRenderProps<DrawerProps>) => {
  const { title, side } = element.props;
  return (
    <Drawer title={title} isOpen onClose={noop} side={side ?? undefined}>
      {children}
    </Drawer>
  );
};

const ModalRenderer = ({
  element,
  children,
}: ComponentRenderProps<ModalProps>) => {
  const { type } = element.props;
  return (
    <Modal type={type ?? undefined} isOpen onClose={noop}>
      {children}
    </Modal>
  );
};

/**
 * Render the spec's `Text` primitive as plain text. React accepts a string
 * as a valid child / element, so the renderer returns the content directly.
 * Without this, the spec model (`children: string[]` referencing other
 * elements) has no way to express raw text content, and the LLM was
 * reaching for empty `<div />` placeholders inside Heading / Anchor / Card.
 */
const TextRenderer = ({ element }: ComponentRenderProps<TextProps>) =>
  element.props.content;

/**
 * Look up an ArteOdyssey icon component by name. The Catalog Zod enum
 * already constrains `name` to a known icon, so the cast is safe — but we
 * still null-check to avoid a hard crash if a stale spec carries a name
 * that no longer exists in the library (e.g. after an icon rename).
 */
const IconRenderer = ({ element }: ComponentRenderProps<IconProps>) => {
  const { name, size } = element.props;
  const Component = (arteOdyssey as Record<string, unknown>)[name] as
    | ComponentType<{ size?: 'sm' | 'md' | 'lg' }>
    | undefined;
  if (!Component) return null;
  return <Component size={size ?? undefined} />;
};

/**
 * Resolve a string icon name (e.g. `"HistoryIcon"`) into an actual
 * ArteOdyssey icon React element. Used by renderers whose React
 * component takes a `ReactNode` slot for an icon while the catalog
 * Zod schema models the prop as the icon-name enum (so the AI picks
 * a valid name). Returns `undefined` for null / missing / unknown
 * names so the wrapped component falls back to its no-icon
 * appearance instead of rendering broken text.
 *
 * Mirrors the codegen-side `splitIconProps` helper in
 * `codegen-shared.ts` — both sides need to convert
 * "string in spec" → "<IconName /> in real React" or the preview
 * shows "ChevronIcon" as literal text next to the button label.
 */
const resolveIconNode = (
  name: string | null | undefined,
): React.ReactElement | undefined => {
  if (name === null || name === undefined || name === '') return undefined;
  const Component = (arteOdyssey as Record<string, unknown>)[name] as
    | ComponentType<{ size?: 'sm' | 'md' | 'lg' }>
    | undefined;
  if (!Component) return undefined;
  return <Component size="sm" />;
};

const LinkButtonRenderer = ({
  element,
  children,
}: ComponentRenderProps<LinkButtonProps>) => {
  const {
    variant,
    size,
    color,
    href,
    startIcon,
    endIcon,
    active,
    openInNewTab,
  } = element.props;
  // ArteOdyssey's LinkButton types `children` as `string`. The
  // Renderer hands us ReactNode[] (the spec's `Text` child has
  // already been rendered into JSX). Cast through a fragment so the
  // node tree reaches the component without a type fight.
  return (
    <LinkButton
      href={href}
      variant={variant ?? undefined}
      size={size ?? undefined}
      color={color ?? undefined}
      startIcon={resolveIconNode(startIcon)}
      endIcon={resolveIconNode(endIcon)}
      active={active ?? undefined}
      openInNewTab={openInNewTab ?? undefined}
    >
      {children as unknown as string}
    </LinkButton>
  );
};

const IconButtonRenderer = ({
  element,
  children,
}: ComponentRenderProps<IconButtonProps>) => {
  const { label, size, bg } = element.props;
  return (
    <IconButton
      label={label}
      size={size ?? undefined}
      bg={bg ?? undefined}
      onAction={noop}
    >
      {children}
    </IconButton>
  );
};

const PaginationRenderer = ({
  element,
}: ComponentRenderProps<PaginationProps>) => {
  const { totalPages, currentPage, isDisabled, prevLabel, nextLabel } =
    element.props;
  return (
    <Pagination
      totalPages={totalPages}
      currentPage={currentPage}
      onPageChange={noop}
      isDisabled={isDisabled ?? undefined}
      prevLabel={prevLabel ?? undefined}
      nextLabel={nextLabel ?? undefined}
    />
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
  // Generated entries first; hand-written below override on name conflict.
  ...generatedRegistry,
  Button: ButtonRenderer,
  Card: CardRenderer,
  Alert: AlertRenderer,
  FormControl: FormControlRenderer,
  Drawer: DrawerRenderer,
  Modal: ModalRenderer,
  Pagination: PaginationRenderer,
  Icon: IconRenderer,
  IconButton: IconButtonRenderer,
  LinkButton: LinkButtonRenderer,
  Text: TextRenderer,
  div: layoutElementRenderer('div'),
  section: layoutElementRenderer('section'),
  header: layoutElementRenderer('header'),
  main: layoutElementRenderer('main'),
};
