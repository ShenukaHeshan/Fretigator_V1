class VenturiHandler {
    constructor(serialHandler) {
        this.serialHandler = serialHandler;
        this.serialIntervalMs = 5000;
        this.venturiValueArray = Array(8).fill(0);
        this.readingInterval = null;
        this.venturiInterval = null;
        this.stopInterval = null;

        this.startECPHReading();
    }

    startECPHReading() {
        if (!this.readingInterval) {
            this.clearAllIntervals();
            const ecphData = {
                S: 1,
                R: 2,
                STATE: 5,
                T_ID: 0,
                VALUE: 0,
            };
            this.readingInterval = setInterval(() => {
                this.serialHandler.sendSerial(JSON.stringify(ecphData));
            }, this.serialIntervalMs);
        }
    }

    stopVenturi(callback) {
        if (!this.stopInterval) {
            this.clearAllIntervals();
            let timeoutCounter = 0;

            this.stopInterval = setInterval(() => {
                const venturiData = {
                    S: 1,
                    R: 2,
                    STATE: 0,
                    T_ID: 0,
                    VALUE: 0,
                };

                this.serialHandler.sendSerial(JSON.stringify(venturiData));
                let allValuesZero = this.venturiValueArray.every((value) => value === 0);

                if (allValuesZero) {
                    this.clearAllIntervals();
                    this.startECPHReading();
                    callback(true);
                }

                if (timeoutCounter >= 20) {
                    this.clearAllIntervals();
                    callback(false);
                }
                timeoutCounter++;
            }, this.serialIntervalMs);
        }
    }

    setVenturiEC(tankId, ecValue) {
        this.clearAllIntervals();
        const ecData = {
            S: 1,
            R: 2,
            STATE: 2,
            T_ID: tankId,
            VALUE: ecValue,
        };

        this.venturiInterval = setInterval(() => {
            this.serialHandler.sendSerial(JSON.stringify(ecData));
        }, this.serialIntervalMs);
    }

    setVenturiPH(acidTankId, baseTankId, minPH, maxPH) {
        this.clearAllIntervals();
        const phData = {
            S: 1,
            R: 2,
            STATE: 1,
            A: acidTankId,
            B: baseTankId,
            data: [maxPH, minPH],
        };

        this.venturiInterval = setInterval(() => {
            this.serialHandler.sendSerial(JSON.stringify(phData));
        }, this.serialIntervalMs);
    }

    setInlineECPH(inlineECPHData) {
        this.clearAllIntervals();
        this.venturiInterval = setInterval(() => {
            this.serialHandler.sendSerial(JSON.stringify(inlineECPHData));
        }, this.serialIntervalMs);
    }

    updateVenturiState(data) {
        this.venturiValueArray = data;
    }

    clearAllIntervals() {
        if (this.readingInterval) {
            clearInterval(this.readingInterval);
            this.readingInterval = null;
        }
        if (this.venturiInterval) {
            clearInterval(this.venturiInterval);
            this.venturiInterval = null;
        }
        if (this.stopInterval) {
            clearInterval(this.stopInterval);
            this.stopInterval = null;
        }
    }
}

export default VenturiHandler;
