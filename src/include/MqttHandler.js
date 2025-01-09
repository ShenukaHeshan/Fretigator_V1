import mqtt from "mqtt";
import MqttEncryption from "./mqttEncryption.js";
import colors from "colors";
import * as CF from "./commonFunctions.js";

class MqttHandler {
    constructor(config, commandHandler, mqttError) {
        this.connectionOptions = {
            host: config.Mqtt.brokerHost,
            port: config.Mqtt.brokerPort,
            rejectUnauthorized: false,
            username: config.Mqtt.Username,
            password: config.Mqtt.Password,
            qos: 1,
            reconnectPeriod: 1000,
        };

        this.publishTopic = config.Mqtt.topic;
        this.subscribeTopic = config.Mqtt.listeningTopic;
        this.farmTopic = config.Mqtt.farmTopic;
        this.farmKey = config.Mqtt.farmKey;
        this.deviceCommandHandler = commandHandler;
        this.encryptionKey = config.Mqtt.key;
        this.dataBus_Mqtt = config.dataBus;
        this.subscribedTopics = new Set();
        this.mqttEncryption = new MqttEncryption(() => {
            mqttError();
        });

        this.initializeMQTT();
    }

    publishToTopic(topic, data) {
        if (this.clientDashboardMQTT.connected) {
            console.log(`MQTT message published to topic: ${topic}`);
            this.clientDashboardMQTT.publish(topic, data, (err) => {
                if (err) {
                    CF.ErrorLog("Failed to publish message", err);
                }
            });
        } else {
            CF.ErrorLog("Client not connected, Skipping publish.");
        }
    }

    publish(data) {
        try {
            const encryptedMessage = this.mqttEncryption.encrypt(JSON.stringify(data), this.encryptionKey);
            const taggedMessage = `<START>${encryptedMessage}<END>`;
            this.publishToTopic(this.publishTopic, taggedMessage);
        } catch (error) {
            console.log(error);

        }
    }

    remote(remoteId, data) {
        this.publishToTopic(this.farmTopic, JSON.stringify(data));
    }

    publishToTopicWithEncryption(data, key, topic) {
        const encryptedMessage = this.mqttEncryption.encrypt(JSON.stringify(data), key);
        const taggedMessage = `<START>${encryptedMessage}<END>`;
        this.publishToTopic(topic, taggedMessage);
    }

    subscribe(topic) {
        if (this.subscribedTopics.has(topic)) {
            console.log(`Already subscribed to the topic: ${topic}`);
            return;
        }

        this.clientDashboardMQTT.subscribe(topic, (err) => {
            if (err) {
                CF.ErrorLog("Error subscribing to topic", err);
            } else {
                this.subscribedTopics.add(topic);
            }
        });
    }

    updateMqtt(newConfig) {
        // Unsubscribe from current topics
        if (this.clientDashboardMQTT.connected) {
            this.subscribedTopics.forEach((topic) => {
                this.clientDashboardMQTT.unsubscribe(topic, (err) => {
                    if (err) CF.ErrorLog("Error unsubscribing from topic", err);
                });
            });
            this.subscribedTopics.clear();
        }

        // Update configuration and re-subscribe to new topics
        this.publishTopic = newConfig.Mqtt.topic;
        this.subscribeTopic = newConfig.Mqtt.listeningTopic;
        this.farmTopic = newConfig.Mqtt.farmTopic;
        this.encryptionKey = newConfig.Mqtt.key;
        this.dataBus_Mqtt = newConfig.dataBus;
        this.farmKey = newConfig.Mqtt.farmKey;

        // Subscribe to the updated main topic
        this.subscribe(this.subscribeTopic);
    }

    initializeMQTT() {
        console.log("Attempting to connect to MQTT broker...");

        this.clientDashboardMQTT = mqtt.connect(this.connectionOptions);

        this.clientDashboardMQTT.on("connect", () => {
            console.log("Connected to MQTT broker successfully!");
            this.subscribe(this.subscribeTopic);
        });

        this.clientDashboardMQTT.on("error", (err) => {
            CF.ErrorLog("MQTT Error", err);
        });

        this.clientDashboardMQTT.on("reconnect", () => {
            console.log("Reconnecting to MQTT Broker...");
        });

        this.clientDashboardMQTT.on("close", () => {
            CF.ErrorLog("MQTT connection closed.");
        });

        this.clientDashboardMQTT.on("message", (topic, message) => {
            console.log(colors.green(`MQTT message received from: ${topic}`));
            this.processIncomingMessage(topic, message);
        });
    }

    processIncomingMessage(topic, message) {
        try {
            let decryptMessage;
            if (topic === this.subscribeTopic) {
                decryptMessage = this.mqttEncryption.decrypt(message.toString(), this.encryptionKey);
                if (decryptMessage) {
                    const parsedMessage = JSON.parse(decryptMessage);
                    console.log(parsedMessage);
                    this.deviceCommandHandler(parsedMessage);
                }
            } else if (topic === this.farmTopic) {
                CF.ErrorLog("No handle for Mqtt farmTopic");
            } else {
                this.dataBus_Mqtt.forEach((element) => {
                    if (topic === element.Mqtt.listeningTopic) {
                        decryptMessage = this.mqttEncryption.decrypt(message.toString(), element.Mqtt.key);
                        if (decryptMessage) {
                            const parsedMessage = JSON.parse(decryptMessage);
                            console.log(parsedMessage);
                            this.deviceCommandHandler(parsedMessage);
                        }
                    }
                });
            }
        } catch (err) {
            CF.ErrorLog("Message processing error", err);
        }
    }
}

export default MqttHandler;