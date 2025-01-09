import crypto from "crypto";
import * as CF from "./commonFunctions.js";

class MqttEncryption {
    constructor(err) {
        this.callback = err;
    }

    encrypt(text, key) {
        try {
            const aesKey = Buffer.from(key, "utf8").slice(0, 16);
            const aesIv = Buffer.from([123, 43, 46, 89, 29, 187, 58, 213, 78, 50, 19, 106, 205, 1, 5, 7]);
            const cipher = crypto.createCipheriv("aes-128-cbc", aesKey, aesIv);
            let encrypted = cipher.update(text, "utf8", "base64");
            encrypted += cipher.final("base64");
            return encrypted;
        } catch (error) {
            CF.ErrorLog("Encryption failed.", error);
            callback();
            return;
        }
    }

    decrypt(encryptedText, key) {
        try {
            const aesKey = Buffer.from(key, "utf8").slice(0, 16);
            const aesIv = Buffer.from([123, 43, 46, 89, 29, 187, 58, 213, 78, 50, 19, 106, 205, 1, 5, 7]);
            const decipher = crypto.createDecipheriv("aes-128-cbc", aesKey, aesIv);
            let decrypted = decipher.update(encryptedText, "base64", "utf8");
            decrypted += decipher.final("utf8");
            return decrypted;
        } catch (error) {
            CF.ErrorLog("Decryption failed.", error);
            callback();
            return;
        }
    }
}

export default MqttEncryption;
