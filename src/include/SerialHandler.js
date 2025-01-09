import { SerialPort, ReadlineParser } from "serialport";
import gpio from "rpi-gpio";
import delay from "delay";
import * as CF from "./commonFunctions.js";
import colors from "colors";

class SerialHandler {
    constructor() {
        this.portList = [];
        this.scanInterval = null;
        this.openPorts = [];
        this.serialPortLock = ["ttyS"];
        this.baudRate = 9600; //115200
        this.serialPortLockEnabled = true;
        this.bufferArray = [];
        this.callback = null;
    }

    initializeSerial(callback) {
        this.callback = callback;

        gpio.setup(18, gpio.DIR_OUT, () => {
            gpio.write(18, 0, (err) => {
                if (err) CF.ErrorLog(`Error writing to GPIO pin 18 `, err);
            })
        });

        this.scanPorts();
        this.startScanTimer();
        this.startMessageTransmission();
    }

    openAllPorts() {
        this.portList.forEach((portPath) => {
            if (this.openPorts.findIndex((port) => port.path === portPath) < 0) {
                //reject bluetooth port memory leak
                if (!portPath.includes("/dev/ttyAMA")) {
                    this.reOpenPort(portPath);
                }
            }
        });
    }

    scanPorts() {
        this.portList = [];
        SerialPort.list().then((ports) => {
            ports.forEach((port) => {
                this.portList.push(port.path);
                CF.DebugLog(`Serial Port: ${JSON.stringify(port)}`);
            });
            if (this.serialPortLockEnabled) {
                this.checkLockedSerialPorts();
            }
        }).catch((err) => CF.ErrorLog("Error scanning serial ports", err));
    }

    checkLockedSerialPorts() {
        this.serialPortLock.forEach((lockedPort) => {
            if (this.portList.findIndex((portPath) => portPath.includes(lockedPort)) < 0) {
                CF.ErrorLog(`Serial port not found: ${lockedPort}.`);
            }
        });
    }

    reOpenPort(portPath) {
        const parser = new ReadlineParser();
        const port = new SerialPort({
            path: portPath,
            baudRate: this.baudRate,
            dataBits: 8,
            parity: "none",
            stopBits: 1,
            flowControl: false,
        });

        port.pipe(parser);
        parser.on("data", (data) => this.handleData(data, portPath));
        port.on("open", () => this.onPortOpen(port));
        port.on("close", () => this.onPortClose(portPath));
        port.on("error", (err) => this.onPortError(portPath, err));
    }

    onPortOpen(port) {
        CF.DebugLog(`Port opened: ${port.path}`);
        if (this.openPorts.findIndex((openPort) => openPort.path === port.path) < 0) {
            this.openPorts.push(port);
        }
    }

    handleData(data, portPath) {
        CF.SerialLog(portPath, data);
        try {
            const jsonData = JSON.parse(data);
            CF.DebugLog(`Serial Data received. portPath : ${portPath}, data : ${data}`);
            this.callback(portPath, jsonData);
        } catch (err) {
            CF.ErrorLog(`Serial Parsing error portPath : ${portPath}, data : --${data}--`, err);
        }
    }

    onPortClose(portPath) {
        CF.DebugLog(`Port closed: ${portPath}`);
        this.openPorts = this.openPorts.filter((port) => port.path !== portPath);
    }

    onPortError(portPath, error) {
        CF.ErrorLog(`Error on port ${portPath}`, error);
        this.openPorts = this.openPorts.filter((port) => port.path !== portPath);
    }

    startScanTimer() {
        this.scanInterval = setInterval(() => {
            this.scanPorts();
            delay(500).then(() => {
                if (this.openPorts.length < this.portList.length) {
                    this.openAllPorts();
                }
            });
        }, 2000);
    }

    sendSerial(data) {
        if (this.bufferArray.length == 0 || this.bufferArray[this.bufferArray.length - 1] != data) {
            this.bufferArray.push(data);
            
            console.log(colors.yellow.bgBlack(this.bufferArray));
        }
    }

    startMessageTransmission() {
        setInterval(() => {
            CF.DebugLog(`Buffer Array :  ${this.bufferArray}`);
            if (this.bufferArray.length > 0) {
                this.openPorts.forEach((port) => {
                    console.log(colors.green.bgBlack(`Sending Serial - Port: ${port.path}, Data: ${this.bufferArray[0]}`));
                    this.sendDataToNode(port, this.bufferArray[0]);
                });
            }
        }, 1200);
    }

    async sendDataToNode(port, data) {

        gpio.write(18, 1, (err) => {
            if (err) CF.ErrorLog(`Error enabling GPIO pin 18 for Serial transmission `, err);
        })

        await this.sleep(10);
        port.write(`${data}\r\n`);

        this.bufferArray = this.bufferArray.filter((bufferData) => bufferData !== data);
        await this.sleep(150);

        gpio.write(18, 0, (err) => {
            if (err) CF.ErrorLog(`Error enabling GPIO pin 18 for Serial transmission `, err);
        })
    }

    clearMessageBufferByAddress(address) {
        this.bufferArray = this.bufferArray.filter((msg) => {
            const parsedMsg = JSON.parse(msg);
            return parsedMsg.R !== address;
        });
    }

    sleep(duration) {
        return new Promise((resolve) => setTimeout(resolve, duration));
    }
}

export default SerialHandler;
