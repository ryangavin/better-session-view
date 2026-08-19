import { useState } from 'react';
import { Device } from '../../../../../widgets/src/chrome/Device.js';
import { Select } from '../../../../../widgets/src/controls/Select.js';
import { XYPad } from '../../../../../widgets/src/controls/XYPad.js';
import type { Param } from '../../../../../widgets/src/param/param.js';
import { deviceParam } from '../../../lib/liveParam.js';
import type { DeviceFaceProps } from '../face.js';
import './Plugin.css';

/**
 * The container Live draws around a plug-in it cannot draw itself.
 *
 * A VST or AU has its own window and Live has no way inside it, so what sits in
 * the chain is a shell holding two things: an X-Y control, and the two choosers
 * naming which of the plug-in's parameters that control moves. It is the whole
 * device, which makes it the plainest possible caller of
 * [`XYPad`](../../../../../widgets/src/controls/XYPad.tsx) — a plane with
 * nothing drawn behind it — and the reason it exists here is to be exactly that.
 *
 * **It is not in [the registry](../faces.ts), on purpose.** Two things would
 * have to be true first. A plug-in's `class_name` is almost certainly
 * `PluginDevice`, but `bridge/LOM.md` has no section for that class and nothing
 * here has read one off a real set — and registering a guess would put this
 * face in front of every plug-in in a chain, replacing `Faceplate`, which draws
 * *all* of a plug-in's controls and is the better answer until the rest is
 * true. If it confirms, this folder becomes `plugindevice/` to match the rule.
 *
 * **Which parameters the axes drive is ours, not Live's.** Live keeps that
 * assignment in the container and the protocol carries a device's parameters
 * rather than the container's own state, so these choosers pick out of the
 * plug-in's parameter list and hold the choice locally. Moving the plane does
 * move Live — those are real parameters and `onParam` is the real write. What
 * won't round-trip is the *choice*, which is why it starts at `none` rather
 * than pretending to restore what Live has.
 *
 * The write goes straight out rather than through
 * [`ParamControl`](../ParamControl.tsx), so it has no local hold while the
 * readback catches up. Every other bound control in the app does have one, and
 * the fix is a `ParamPad` next to the rest of that file rather than anything
 * here.
 */
const UNASSIGNED = 'none';

/** A stand-in range, so an unassigned axis still has a plane to sit on. */
const ABSENT: Param = { kind: 'float', min: 0, max: 1, defaultValue: 0 };

function axisOf(parameters: BSV.DeviceParameterState[] | null, at: number) {
  const state = at > 0 ? parameters?.[at - 1] ?? null : null;
  return {
    state,
    param: state ? deviceParam(state) : ABSENT,
    value: state?.value ?? 0,
    display: state?.display,
  };
}

export function Plugin({ device, parameters, onParam, onToggle, onFold }: DeviceFaceProps) {
  // 0 is `none`; every other index is one past the parameter it names, so the
  // chooser and the parameter list can't drift apart as the list arrives.
  const [assigned, setAssigned] = useState<[number, number]>([0, 0]);
  const names = [UNASSIGNED, ...(parameters ?? []).map((p) => p.name)];

  const x = axisOf(parameters, assigned[0]);
  const y = axisOf(parameters, assigned[1]);

  return (
    <Device
      name={device.name}
      className="plugin-device"
      on={device.on}
      onToggle={onToggle}
      folded={device.folded}
      onFold={onFold}
      onHotSwap={() => {}}
    >
      <XYPad
        x={{
          param: x.param,
          value: x.value,
          onChange: (next) => assigned[0] > 0 && onParam(assigned[0] - 1, next),
          display: x.display,
        }}
        y={{
          param: y.param,
          value: y.value,
          onChange: (next) => assigned[1] > 0 && onParam(assigned[1] - 1, next),
          display: y.display,
        }}
        width={168}
        height={168}
        showValue={false}
        label={`${device.name} X-Y control`}
      />
      <div className="plugin-assignments">
        <Select
          items={names}
          index={assigned[0]}
          onChange={(next) => setAssigned(([, at]) => [next, at])}
          label="X axis parameter"
        />
        <Select
          items={names}
          index={assigned[1]}
          onChange={(next) => setAssigned(([at]) => [at, next])}
          label="Y axis parameter"
        />
      </div>
    </Device>
  );
}
