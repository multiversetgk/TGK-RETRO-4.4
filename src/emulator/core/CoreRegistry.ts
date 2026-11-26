import type { INesEmulatorCore, NesCoreId } from './INesEmulatorCore';
import { LibretroFceummAdapter } from './LibretroFceummAdapter';

export interface NesCoreDescriptor {
  id: NesCoreId;
  shortName: string;
  label: string;
  repoUrl: string;
  summary: string;
}

export const PRIMARY_NES_CORE_ID: NesCoreId = 'libretro-fceumm';

export const PRIMARY_NES_CORE: NesCoreDescriptor = {
  id: 'libretro-fceumm',
  shortName: 'FCEUmm',
  label: 'FCEUmm (libretro-fceumm)',
  repoUrl: 'https://github.com/libretro/libretro-fceumm',
  summary: 'Libretro C/WASM NES core · 200+ mappers & cycle-accurate APU',
};

export const NES_CORE_REGISTRY: NesCoreDescriptor[] = [PRIMARY_NES_CORE];

export function getCoreDescriptor(_coreId: NesCoreId = PRIMARY_NES_CORE_ID): NesCoreDescriptor {
  return PRIMARY_NES_CORE;
}

export function createNesCore(_coreId: NesCoreId = PRIMARY_NES_CORE_ID): INesEmulatorCore {
  return new LibretroFceummAdapter();
}
