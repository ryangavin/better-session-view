import * as React from 'react';

/**
 * DevicePortRow — from bsv-widgets@0.1.0.
 */
export interface DevicePortRowProps {
  /** A `Port` on the leading edge. */
  inlet?: React.ReactNode;
  /** A `Port` on the trailing edge. */
  outlet?: React.ReactNode;
  /** The control or label governed by the ports on this line. */
  children?: React.ReactNode;
  className?: string;
}

export declare const DevicePortRow: React.ComponentType<DevicePortRowProps>;
