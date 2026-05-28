import type { ComponentType, SVGProps } from 'react';
import type { DeviceType } from '../api';
import {
  BoltIcon,
  CubeIcon,
  LampIcon,
  LockIcon,
  MotionIcon,
  ThermometerIcon,
  WaterDropIcon,
  WindIcon,
} from './icons';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export const DEVICE_TYPE_OPTIONS: { value: DeviceType; label: string; Icon: IconComponent }[] = [
  { value: 'thermostat', label: 'Термостат', Icon: ThermometerIcon },
  { value: 'lamp', label: 'Лампа', Icon: LampIcon },
  { value: 'motion_sensor', label: 'Датчик руху', Icon: MotionIcon },
  { value: 'power_meter', label: 'Лічильник', Icon: BoltIcon },
  { value: 'air_quality', label: 'Якість повітря', Icon: WindIcon },
  { value: 'water_leak', label: 'Протікання', Icon: WaterDropIcon },
  { value: 'smart_lock', label: 'Замок', Icon: LockIcon },
];

const map = Object.fromEntries(DEVICE_TYPE_OPTIONS.map((o) => [o.value, o]));

export function deviceLabel(t: DeviceType): string {
  return map[t]?.label ?? t;
}

/** Returns the icon component for a device type — caller renders it with classes. */
export function deviceIconComponent(t: DeviceType): IconComponent {
  return map[t]?.Icon ?? CubeIcon;
}

type DeviceIconProps = SVGProps<SVGSVGElement> & { type: DeviceType };

/** Convenience JSX wrapper: <DeviceIcon type={d.type} className="w-5 h-5" /> */
export function DeviceIcon({ type, ...rest }: DeviceIconProps) {
  const Icon = deviceIconComponent(type);
  return <Icon {...rest} />;
}
