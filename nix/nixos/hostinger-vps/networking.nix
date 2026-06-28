{ lib, ... }:
{
  networking.firewall.allowedTCPPorts = [ 22 80 443 ];
  services.openssh.enable = true;
  networking.hostName = "geosyntra-vps";
}
