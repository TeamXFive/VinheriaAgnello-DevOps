#!/bin/sh
# Script chamado pelo udhcpc: aplica o endereço, o gateway e o DNS recebidos do servidor DHCP.
case "$1" in
  deconfig)
    ip addr flush dev "$interface"
    ip link set "$interface" up
    ;;
  bound|renew)
    ip addr flush dev "$interface"
    ip addr add "$ip/$mask" dev "$interface"
    ip route replace default via "${router%% *}" dev "$interface"
    {
      echo "search $domain"
      for servidor in $dns; do echo "nameserver $servidor"; done
    } > /etc/resolv.conf
    echo "DHCP: $interface recebeu $ip/$mask, gateway $router, DNS $dns, domínio $domain"
    ;;
esac
