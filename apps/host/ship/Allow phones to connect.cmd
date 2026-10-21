@echo off
rem Lets phones and tablets on your network reach TabbyDeck (port 8191). Windows asks for permission once.
echo TabbyDeck needs Windows to let your phone or tablet connect on port 8191.
echo Click Yes when Windows asks.
powershell -NoProfile -Command "Start-Process netsh -Verb RunAs -Wait -ArgumentList 'advfirewall firewall add rule name=TabbyDeck dir=in action=allow protocol=TCP localport=8191'"
echo Done. You can close this window.
pause
