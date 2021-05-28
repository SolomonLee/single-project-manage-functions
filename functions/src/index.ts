import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { successLog, errorLog } from "./common/log";
import { verificationDataFields, authVerification } from "./common/auth";
import * as errorNames from "./common/errorNames";
import { resultOk, resultError } from "./common/result";
// import { resultOk, resultError, Result } from "./common/result";
admin.initializeApp();

const collection = (collectionname: string) =>
    admin.firestore().collection(collectionname);

// ===== User : START
/** 給 會員列表使用 */
// interface MemberInfo {
//     id: string;
//     name: string;
//     /** 上次上線時間 */
//     onlineTimestamp: number;
// }

/** 給 會員 使用 */
interface User {
    email: string;
    userName: string;
}

// interface DBMember {
//     email: string;
//     userName: string;
//     /** 上次上線時間 */
// }

// interface DBMemberSimple {
//     name: string;
//     onlineTimestamp: number;
// }

// interface DBMemberSimpleList {
//     [uid: string]: DBMemberSimple;
// }

/** 當 Firebase Auth 建立新USER 自動建立使用者資訊 */
export const onCreateUser = functions.auth.user().onCreate(async (user) => {
    const name =
        typeof user.email == "string"
            ? user.email.slice(0, user.email.indexOf("@"))
            : Date.now().toString();

    collection("users")
        .doc(user.uid)
        .set({
            email: user.email,
            userName: name,
        } as User)
        .then(() => {
            successLog(`New User email: ${user.email}`, onCreateUser.name);
        });

    collection("users-simple-infos")
        .doc("infos")
        .update({
            [`${user.uid}.name`]: name,
            [`${user.uid}.onlineTimestamp`]: Date.now(),
        });
}); // onCreateUser()

/** 取得使用者資訊 */
export const getUserInfo = functions.https.onCall(async (data, context) => {
    const auth = authVerification(context);

    const user: User = {
        email: "",
        userName: "",
    };

    if (auth === false) {
        return resultError(errorNames.authErrorList.unauthenticated, user);
    }

    try {
        const doc = await collection("users").doc(auth.uid).get();

        if (doc.exists) {
            const data = doc.data() || false;

            collection("users-simple-infos")
                .doc("infos")
                .update({
                    [`${context.auth?.uid}.onlineTimestamp`]: Date.now(),
                });

            if (data !== false) {
                const userInfo = data as User;

                user.email = userInfo.email;
                user.userName = userInfo.userName;

                return resultOk(user);
            }
        }
    } catch (e) {
        errorLog(`getUserInfo: #1 ${e}`, getUserInfo.name);
    }

    return resultError(errorNames.userErrorList.onFindUserInfo, user);
}); // getUserInfo()

/** 更新使用者上線時間 */
export const updateOnlineTime = functions.https.onCall(
    async (data, context) => {
        const auth = authVerification(context);

        if (auth === false) {
            return resultError(errorNames.authErrorList.unauthenticated, null);
        }

        try {
            collection("users-simple-infos")
                .doc("infos")
                .update({
                    [`${context.auth?.uid}.onlineTimestamp`]: Date.now(),
                });
            return resultOk(null);
        } catch (e) {
            errorLog(`updateOnlineTime: #1 ${e}`, updateOnlineTime.name);
        }

        return resultError(errorNames.userErrorList.onFindUserInfo, null);
    }
); // updateOnlineTime()

// ===== User : END

// ===== List : START
export const createList = functions.https.onCall(async (data, context) => {
    const auth = authVerification(context);

    if (auth === false) {
        return resultError(errorNames.authErrorList.unauthenticated, null);
    }

    const errorMsg = verificationDataFields(data, {
        listId: { type: "string", isRequirement: true, default: null },
        name: { type: "string", isRequirement: true, default: null },
        nextListId: { type: "string", isRequirement: true, default: null },
    });

    if (errorMsg.length) {
        return resultError(errorMsg);
    }

    try {
        collection("lists").doc(data.listId).set({
            name: data.name,
            nextListId: data.nextListId,
        });

        return resultOk(data.listId);
    } catch (e) {
        errorLog(`createList: #1 ${e}`, createList.name);
    }

    return resultError(errorNames.userErrorList.onFindUserInfo, "");
}); // createList()

interface UpdateListData {
    id: string;
    name: string;
    nextListId: string;
}
export const updateBatchList = functions.https.onCall(async (data, context) => {
    const auth = authVerification(context);

    if (auth === false) {
        return resultError(errorNames.authErrorList.unauthenticated, null);
    }

    const errorMsg = verificationDataFields(data, {
        arrList: { type: "object", isRequirement: true, default: null },
    });

    if (errorMsg.length) {
        return resultError(errorMsg);
    }

    const updateListData = data.arrList as UpdateListData[];
    if (updateListData.length === 0) {
        return resultOk();
    }

    try {
        const batch = admin.firestore().batch();

        updateListData.forEach((list) => {
            batch.update(collection("lists").doc(list.id), {
                name: list.name,
                nextListId: list.nextListId,
            });
        });

        batch.commit();

        return resultOk("");
    } catch (e) {
        errorLog(`updateBatchList: #1 ${e}`, updateBatchList.name);
    }

    return resultError(errorNames.userErrorList.onFindUserInfo, "");
}); // updateBatchList()

interface RemoveListData {
    prevListId: string;
    removeListId: string;
    nextListId: string;
}
export const removeList = functions.https.onCall(async (data, context) => {
    const auth = authVerification(context);

    if (auth === false) {
        return resultError(errorNames.authErrorList.unauthenticated, null);
    }

    const errorMsg = verificationDataFields(data, {
        prevListId: { type: "string", isRequirement: true, default: null },
        removeListId: { type: "string", isRequirement: true, default: null },
        nextListId: { type: "string", isRequirement: true, default: null },
    });

    if (errorMsg.length) {
        return resultError(errorMsg);
    }

    const removeListData = data as RemoveListData;

    try {
        const batch = admin.firestore().batch();

        batch.update(collection("lists").doc(removeListData.prevListId), {
            nextListId: removeListData.nextListId,
        });

        batch.delete(collection("lists").doc(removeListData.removeListId));

        batch.commit();

        return resultOk("");
    } catch (e) {
        errorLog(`removeList: #1 ${e}`, removeList.name);
    }

    return resultError(errorNames.userErrorList.onFindUserInfo, "");
}); // removeList()
// ===== List : END
