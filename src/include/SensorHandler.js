import * as CF from "./commonFunctions.js";

class SensorHandler {
    constructor(handleSensorError, handleSerialTimeout) {
        this.sensorData = {};
        this.sensorFlags = {};
        this.lastFetchTime = new Date();
        this.handleSensorError = handleSensorError;
        this.handleSerialTimeout = handleSerialTimeout;
        this.serialReceived = false;
        this.sensorCheckTimeouts = {}; // Store timeouts for each sensor

        this.initializeSerialChecker();
    }

    isSerialActive() {
        return this.serialReceived;
    }

    updateSensorData(sensorType, sensorId, value) {
        if (!this.sensorData[sensorId]) {
            this.sensorData[sensorId] = [];
        }

        const { MAX_HISTORY_LENGTH } = SENSOR_CONFIG[sensorType];

        if (this.sensorData[sensorId].length >= MAX_HISTORY_LENGTH) {
            this.sensorData[sensorId].shift();
        }

        this.sensorData[sensorId].push(value);
    }

    calculateVariance(sensorId) {
        const history = this.sensorData[sensorId];
        const mean = history.reduce((a, b) => a + b, 0) / history.length;
        const squaredDifferences = history.map((value) => Math.pow(value - mean, 2));
        return squaredDifferences.reduce((sum, value) => sum + value, 0) / history.length;
    }

    checkSensorHealth(sensor) {
        // Check if sensor handler is enabled
        if (isSensorHandlerEnabled) {
            const variance = this.calculateVariance(sensor.deviceID);
            const { MIN_VARIANCE } = SENSOR_CONFIG[sensor.type_id];

            if (variance < MIN_VARIANCE) {
                this.disableAllSensorChecks();
                CF.ErrorLog(`Sensor ${sensor.userSensorText}(${sensor.deviceID}) has low variance (${variance.toFixed(4)}) and may be malfunctioning.`);
                sensor.sensorReadings = this.sensorData[sensor.deviceID];
                this.handleSensorError(sensor);
            }
        }
    }

    monitorSensor(sensor) {
        this.serialReceived = true;
        this.lastFetchTime = new Date();
        this.initializeSerialChecker();

        this.updateSensorData(sensor.type_id, sensor.deviceID, sensor.sensorValue);

        if (this.sensorFlags[sensor.deviceID]) {
            this.checkSensorHealth(sensor);
        }
    }

    enableSensorCheck(sensorId) {
        if (!this.sensorCheckTimeouts[sensorId]) {
            this.sensorCheckTimeouts[sensorId] = setTimeout(() => {
                this.sensorFlags[sensorId] = true;
                delete this.sensorCheckTimeouts[sensorId];
            }, 30 * 1000);
        }
    }

    disableSensorCheck(sensorId) {
        this.sensorFlags[sensorId] = false;
        if (this.sensorCheckTimeouts[sensorId]) {
            clearTimeout(this.sensorCheckTimeouts[sensorId]);
            delete this.sensorCheckTimeouts[sensorId];
        }
    }

    disableAllSensorChecks() {
        Object.keys(this.sensorFlags).forEach((sensorID) => {
            this.sensorFlags[sensorID] = false;
        });

        // Clear and delete all sensor check timeouts
        Object.keys(this.sensorCheckTimeouts).forEach((sensorId) => {
            clearTimeout(this.sensorCheckTimeouts[sensorId]);
            delete this.sensorCheckTimeouts[sensorId];
        });
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

    getTimeDiff() {
        return (new Date().getTime() - this.lastFetchTime.getTime()) / 1000;
    }
}

export default SensorHandler;