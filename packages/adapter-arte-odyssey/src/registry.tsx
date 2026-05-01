import type {
  ComponentRegistry,
  ComponentRenderProps,
} from '@json-render/react';
import {
  Alert,
  Button,
  Card,
  Drawer,
  FormControl,
  Modal,
  Pagination,
} from '@k8o/arte-odyssey';
import { createElement } from 'react';

import type {
  AlertProps,
  ButtonProps,
  CardProps,
  DrawerProps,
  FormControlProps,
  LayoutElementProps,
  ModalProps,
  PaginationProps,
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
  div: layoutElementRenderer('div'),
  section: layoutElementRenderer('section'),
  header: layoutElementRenderer('header'),
  main: layoutElementRenderer('main'),
};
