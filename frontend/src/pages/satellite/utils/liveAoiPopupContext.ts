/** Remote Sensing toolbox must be open with a drawn or workspace AOI before live AOI popups activate. */
export type RemoteSensingLiveAoiPopupContext = {
  toolboxOpen: boolean;
  envSection: string;
  hasAoiGeometry: boolean;
};

export function isRemoteSensingLiveAoiPopupAllowed(ctx: RemoteSensingLiveAoiPopupContext): boolean {
  return ctx.toolboxOpen && ctx.envSection === 'remote-sensing' && ctx.hasAoiGeometry;
}
