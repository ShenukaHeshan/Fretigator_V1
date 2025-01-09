import RelaySchedule from "./RelaySchedule.js";
import * as CF from "./commonFunctions.js";

class ExternalNode {
    constructor(node, serialHandler, mqttHandler, serialError) {
        this.node = node;
        this.address = Number(node.dataBusAddress);
        this.serialHandler = serialHandler;
        this.mqttHandler = mqttHandler;
        this.relaySetArray = Array(12).fill(0);
        this.lastFetchTime = new Date();
        this.heartBeatInterval = null;
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

    isSerialActive() {
        return this.serialReceived;
    }

    updateNode(node) {

        node.deviceArray.forEach((device) => {
            const index = this.getRelayIndex(device.deviceID);
            device.sensorValue = index > -1 ? (this.node.deviceArray[index].sensorValue || 0) : 0;

            if (device.userInvolveValue == "on") {
                this.relaySwitchExternalWrapper(device.deviceID, TURNON);
            } else if (device.userInvolveValue == "off") {
                this.relaySwitchExternalWrapper(device.deviceID, TURNOFF);
            } else if (device.userInvolveValue == "auto" && device.remoteEnable == 1) {
                this.relaySwitchExternalWrapper(device.deviceID, TURNOFF);
                this.rescheduleRelay(device);
            }
        });

        this.node = node;

        this.startHeartBeat();
        this.initializeMqtt();
    }

    getDeviceValue(deviceId) {
        const device = this.node.deviceArray.find((item) => item.deviceID == Number(deviceId));
        return device ? device.sensorValue : 0;
    }

    relaySwitchExternalWrapper(deviceId, value) {
        const index = this.getRelayIndex(deviceId);
        if (index > -1) {
            this.relaySetArray[index] = 1 - value; // Inverting the value
            this.sendHeartBeat();
        } else {
            CF.ErrorLog(`External node device id ${deviceId} not found.`);
        }
    }

    stopAll() {
        this.relaySetArray = Array(12).fill(0);
        this.sendHeartBeat();
    }

    userSet(deviceId, value) {
        const index = this.getRelayIndex(deviceId);
        if (index == -1) {
            CF.ErrorLog(`Invalid device ID ${deviceId} or value ${value}.`);
            return;
        }

        const relayDevice = this.node.deviceArray[index];

        const updateRelayDevice = (value, action) => {
            relayDevice.userInvolveValue = value;
            relayDevice.userInvolveTime = new Date();
            this.relaySwitchExternalWrapper(deviceId, action);
        };

        if (value == "on") {
            updateRelayDevice(value, TURNON);
        } else if (value == "off") {
            updateRelayDevice(value, TURNOFF);
        } else if (value == "auto" && relayDevice.remoteEnable == 1) {
            updateRelayDevice(value, TURNOFF);
            this.rescheduleRelay(relayDevice);
        }

        this.sendHeartBeat();
    }


    rescheduleRelay(device) {
        if (this.relaySchedule) {
            this.relaySchedule.reschedule(device);
        }
    }

    initialize() {
        this.node.deviceArray.forEach((device) => {

            device.sensorValue = device.sensorValue ?? 0;

            this.node.deviceArray.forEach((device) => {
                if (device.userInvolveValue == "on") {
                    this.relaySwitchExternalWrapper(device.deviceID, TURNON);
                } else if (device.userInvolveValue == "off") {
                    this.relaySwitchExternalWrapper(device.deviceID, TURNOFF);
                } else if (device.userInvolveValue == "auto" && device.remoteEnable == 1) {
                    this.relaySwitchExternalWrapper(device.deviceID, TURNOFF);
                    this.rescheduleRelay(device);
                }
            });

        });

        this.relaySchedule = new RelaySchedule(this.node.deviceArray, (deviceID, scheduleIndex, relaySchedule, duration) => {

            const index = this.getRelayIndex(deviceID);
            if (index == -1) return;

            const device = this.node.deviceArray[index];
            if (device.userInvolveValue == "auto" && device.remoteEnable == 1) {
                this.relayExternalTimerOnOff(deviceID, duration);
            }
        });

        this.startHeartBeat();
        this.initializeMqtt();
        this.initializeSerialChecker();
    }

    startHeartBeat() {
        this.stopHeartBeat();
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

    initializeMqtt() {
        this.mqttHandler.subscribe(this.node.Mqtt.listeningTopic);
        clearInterval(this.mqttInterval); // Clear existing intervals
        this.mqttInterval = setInterval(this.publishMqtt.bind(this), 6000);
    }

    initializeSerialChecker() {
        if (!this.interval) {
            this.interval = setInterval(() => {
                if (this.getTimeDiff() > 30) {
                    this.serialReceived = false;
                    this.handleSerialTimeout();
                    clearInterval(this.interval);
                    this.interval = null;
                }
            }, 1000);
        }
    }

    publishMqtt() {
        if (this.getTimeDiff() < 30) {
            this.node.DashboardMQTTSendTime = CF.formatDateToDisplay();
            this.mqttHandler.publishToTopicWithEncryption(this.node, this.node.Mqtt.key, this.node.Mqtt.topic);
        }
    }

    getMqttRequest() {
        clearInterval(this.mqttInterval);
        this.mqttInterval = setInterval(this.publishMqtt.bind(this), 3000);

        setTimeout(() => {
            clearInterval(this.mqttInterval);
            this.mqttInterval = setInterval(this.publishMqtt.bind(this), 6000);
        }, 300 * 1000);
    }

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

export default ExternalNode;