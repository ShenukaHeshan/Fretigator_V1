import RelaySchedule from "./RelaySchedule.js";
import * as CF from "./commonFunctions.js";

class FertigationNode {
    constructor(nodeData, serialHandler, serialError) {
        this.node = nodeData;
        // this.address = nodeData.dataBusAddress;
        this.address = 2;
        this.serialHandler = serialHandler;
        //this.mqttHandler = mqttHandler;
        this.relaySetArray = Array(12).fill(0);
        this.lastFetchTime = new Date();
        this.heartBeatInterval = null;
        this.interval = null;
        this.handleSerialTimeout = serialError;
        this.serialReceived = false;

        this.initialize();
    }

    getId() {
        return this.node.current_node_id;
    }

    getAddress() {
        return this.address;
    }

    getNode() {
        return this.node;
    }

    setLastFetch() {
        this.lastFetchTime = new Date();
        this.serialReceived = true;
        this.initializeSerialChecker();
    }

    // getLastFetch() {
    //     return this.lastFetchTime;
    // }

    isSerialActive() {
        return this.serialReceived;
    }

    updateNode(nodeData) {
        this.node = nodeData;
        //this.mqttHandler = mqttHandler;

        this.node.deviceArray.forEach((device) => {
            if (["auto", "off", "on"].includes(device.userInvolveValue)) {
                this.userSet(device.deviceID, device.userInvolveValue);
            }

            this.rescheduleRelay(device);
        });

        this.startHeartBeat();
        //this.initializeMqtt();
    }

    getDeviceValue(deviceId) {
        const device = this.node.deviceArray.find((item) => item.deviceID == deviceId);
        return device ? device.sensorValue : 0;
    }

    relaySwitchExternalWrapper(deviceId, value) {
        const index = this.getRelayIndex(deviceId);
        if (index > -1) {
            this.relaySetArray[index] = 1 - value; // Inverting the value
            this.serialHandler.clearMessageBufferByAddress(this.address);
            this.sendHeartBeat();
        } else {
            CF.ErrorLog(`External node device id ${deviceId} not found.`);
        }
    }

    stopAll() {
        this.relaySetArray = Array(12).fill(0);
        this.sendHeartBeat();
    }

    // userSet(deviceId, value) {
    //     const index = this.getRelayIndex(deviceId);
    //     if (index > -1 && ["auto", "off", "on"].includes(value)) {
    //         this.node.deviceArray[index].userInvolveValue = value;
    //         //this.sendHeartBeat();
    //     } else {
    //         CF.ErrorLog(`Invalid device ID ${deviceId} or value ${value}.`);
    //     }
    // }

    userSet(deviceId, value) {
        const index = this.getRelayIndex(deviceId);

        if (index > -1 && ["auto", "off", "on"].includes(value)) {
            // Process based on value
            if (value === "on") {
                this.relaySwitchExternalWrapper(deviceId, TURNON);
            } else if (value === "off") {
                this.relaySwitchExternalWrapper(deviceId, TURNOFF);
            } else if (value === "auto") {
                // If "auto", turn off first, then reschedule
                this.relaySwitchExternalWrapper(deviceId, TURNOFF);
                this.rescheduleRelay(this.node.deviceArray[index]);
            }

            // Optional: Send a heartbeat if needed
            this.sendHeartBeat();

        } else {
            CF.ErrorLog(`Invalid device ID ${deviceId} or value ${value}.`);
        }
    }


    rescheduleRelay(device) {
        if (this.relaySchedule) {
            this.relaySchedule.reschedule(device);
        }
    }

    initialize() {
        this.node.deviceArray.forEach((device, index) => {
            if (typeof device.userInvolveValue === "undefined") {
                this.node.deviceArray[index].userInvolveValue = "auto";
            }
        });

        this.relaySchedule = new RelaySchedule(this.node.deviceArray, function (deviceID, scheduleIndex, relaySch, duration) {
            const userInvolveValue = this.node.deviceArray[this.getRelayIndex(deviceID)].userInvolveValue;
            if (userInvolveValue === "auto") {
                this.relayExternalTimerOnOff(deviceID, duration);
            }
        });

        this.startHeartBeat();
        this.initializeSerialChecker();
    }

    startHeartBeat() {
        this.stopHeartBeat(); // Clear any existing intervals before starting a new one
        this.heartBeatInterval = setInterval(() => {
            this.sendHeartBeat();
        }, 5000);
    }

    stopHeartBeat() {
        if (this.heartBeatInterval) {
            clearInterval(this.heartBeatInterval);
            this.heartBeatInterval = null;
        }
    }

    sendHeartBeat() {
        const relaySetData = {
            S: 1,
            R: this.address,
            D: 1,
            ch_set: this.relaySetArray,
        };
        this.serialHandler.sendSerial(JSON.stringify(relaySetData));
    }

    // initializeMqtt() {
    //     this.mqttHandler.subscribe(this.node.Mqtt.listeningTopic);
    //     clearInterval(this.mqttInterval); // Clear existing intervals
    //     this.mqttInterval = setInterval(this.publishMqtt.bind(this), 5000);
    // }

    initializeSerialChecker() {
        if (this.interval) {
            clearInterval(this.interval);
        }

        this.interval = setInterval(() => {
            if (this.getTimeDiff() > 30) {
                this.serialReceived = false;
                this.handleSerialTimeout();
                clearInterval(this.interval);
            }
        }, 1000);
    }

    publishMqtt() {
        // if (this.getTimeDiff() < 60) {
        //     this.node.DashboardMQTTSendTime = CF.formatDateToDisplay();
        //     this.mqttHandler.publishToTopicWithEncryption(this.node, this.node.Mqtt.key, this.node.Mqtt.topic);
        // }
    }

    // getMqttRequest() {
    //     clearInterval(this.mqttInterval);
    //     this.mqttInterval = setInterval(this.publishMqtt, 3000);

    //     setTimeout(() => {
    //         this.mqttInterval = setInterval(this.publishMqtt, 6000);
    //     }, 120 * 1000);
    // }

    relayExternalTimerOnOff(deviceId, duration) {
        this.relaySwitchExternalWrapper(deviceId, TURNON);
        setTimeout(() => {
            this.relaySwitchExternalWrapper(deviceId, TURNOFF);
        }, duration * 1000);
    }

    getRelayIndex(deviceId) {
        return this.node.deviceArray.findIndex((item) => item.deviceID === Number(deviceId));
    }

    getTimeDiff() {
        return (new Date().getTime() - this.lastFetchTime.getTime()) / 1000;
    }
}

export default FertigationNode;