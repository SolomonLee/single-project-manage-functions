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

    collection("users-simple-infos").doc(user.uid).set({
        name: name,
        uid: user.uid,
        onlineTimestamp: Date.now(),
    });
}); // onCreateUser()

/** 取得使用者資訊 */
export const getUserInfo = functions.https.onCall(async (data, context) => {
    const auth = authVerification(context);

    const user: User = {
        email: "",
        userName: "",
    };

    if (auth === false || typeof context.auth?.uid === "undefined") {
        return resultError(errorNames.authErrorList.unauthenticated, user);
    }

    try {
        const doc = await collection("users").doc(auth.uid).get();

        if (doc.exists) {
            const data = doc.data() || false;

            collection("users-simple-infos").doc(context.auth.uid).update({
                onlineTimestamp: Date.now(),
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

        if (auth === false || typeof context.auth?.uid === "undefined") {
            return resultError(errorNames.authErrorList.unauthenticated, null);
        }

        try {
            collection("users-simple-infos").doc(context.auth.uid).update({
                onlineTimestamp: Date.now(),
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
        const result = await collection("lists")
            .doc(data.listId)
            .set({
                name: data.name,
                nextListId: data.nextListId,
            })
            .then(() => resultOk(data.listId))
            .catch(() => resultError(""));

        return result;
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

        const result = await batch
            .commit()
            .then(() => resultOk(""))
            .catch(() => resultError(""));

        return result;
    } catch (e) {
        errorLog(`updateBatchList: #1 ${e}`, updateBatchList.name);
    }

    return resultError(errorNames.userErrorList.onFindUserInfo, "");
}); // updateBatchList()

interface RemoveListData {
    prevListId: string;
    removeListId: string;
    nextListId: string;
    cardIds: string[];
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
        cardIds: { type: "object", isRequirement: true, default: null },
    });

    if (errorMsg.length) {
        return resultError(errorMsg);
    }

    const removeListData = data as RemoveListData;

    try {
        const batch = admin.firestore().batch();

        if (removeListData.prevListId !== "") {
            batch.update(collection("lists").doc(removeListData.prevListId), {
                nextListId: removeListData.nextListId,
            });
        }

        batch.delete(collection("lists").doc(removeListData.removeListId));

        const removeCardMemberPromiseArr = [] as Promise<unknown>[];
        removeListData.cardIds.forEach((cardId) => {
            removeCardMemberPromiseArr.push(
                collection("cards")
                    .doc(cardId)
                    .collection("members")
                    .get()
                    .then((snapshot) => {
                        snapshot.docs.forEach((doc) => {
                            if (doc.exists) {
                                batch.delete(
                                    collection("cards")
                                        .doc(cardId)
                                        .collection("members")
                                        .doc(doc.id)
                                );
                            }
                        });
                    })
            );

            removeCardMemberPromiseArr.push(
                collection("messages")
                    .doc(cardId)
                    .collection("contents")
                    .get()
                    .then((snapshot) => {
                        snapshot.docs.forEach((doc) => {
                            if (doc.exists) {
                                batch.delete(
                                    collection("messages")
                                        .doc(cardId)
                                        .collection("contents")
                                        .doc(doc.id)
                                );
                            }
                        });
                    })
            );

            batch.delete(collection("cards").doc(cardId));
            batch.delete(collection("messages").doc(cardId));
        });

        await Promise.all(removeCardMemberPromiseArr);

        const result = await batch
            .commit()
            .then(() => resultOk())
            .catch(() => resultError(""));

        return result;
    } catch (e) {
        errorLog(`removeList: #1 ${e}`, removeList.name);
    }

    return resultError(errorNames.userErrorList.onFindUserInfo, "");
}); // removeList()
// ===== List : END

// ===== Cards : START
export const createCard = functions.https.onCall(async (data, context) => {
    const auth = authVerification(context);

    if (auth === false) {
        return resultError(errorNames.authErrorList.unauthenticated, null);
    }

    const errorMsg = verificationDataFields(data, {
        cardId: { type: "string", isRequirement: true, default: null },
        name: { type: "string", isRequirement: true, default: null },
        listId: { type: "string", isRequirement: true, default: null },
        nextCardId: { type: "string", isRequirement: true, default: null },
    });

    if (errorMsg.length) {
        return resultError(errorMsg);
    }

    try {
        const p1 = collection("messages").doc(data.cardId).set({});

        const p2 = collection("cards").doc(data.cardId).set({
            content: "",
            members: [],
            listId: data.listId,
            messageId: data.cardId,
            name: data.name,
            nextCardId: data.nextCardId,
        });

        const result = await Promise.all([p1, p2])
            .then(() => resultOk(data.cardId))
            .catch(() => resultError(""));

        return result;
    } catch (e) {
        errorLog(`createCard: #1 ${e}`, createCard.name);
    }

    return resultError(errorNames.userErrorList.onFindUserInfo, "");
}); // createCard()

interface UpdateBatchCardData {
    id: string;
    content: string;
    listId: string;
    name: string;
    nextCardId: string;
}
export const updateBatchCard = functions.https.onCall(async (data, context) => {
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

    const updateCardData = data.arrList as UpdateBatchCardData[];
    if (updateCardData.length === 0) {
        return resultOk();
    }

    try {
        const batch = admin.firestore().batch();

        updateCardData.forEach((card) => {
            batch.update(collection("cards").doc(card.id), {
                content: card.content,
                listId: card.listId,
                name: card.name,
                nextCardId: card.nextCardId,
            });
        });

        const result = await batch
            .commit()
            .then(() => resultOk(""))
            .catch(() => resultError(""));

        return result;
    } catch (e) {
        errorLog(`updateBatchCard: #1 ${e}`, updateBatchCard.name);
    }

    return resultError(errorNames.userErrorList.onFindUserInfo, "");
}); // updateBatchCard()

interface UpdateCardData {
    id: string;
    content: string;
    name: string;
}
export const updateCard = functions.https.onCall(async (data, context) => {
    const auth = authVerification(context);

    if (auth === false) {
        return resultError(errorNames.authErrorList.unauthenticated, null);
    }

    const errorMsg = verificationDataFields(data, {
        id: { type: "string", isRequirement: true, default: null },
        content: { type: "string", isRequirement: true, default: null },
        name: { type: "string", isRequirement: true, default: null },
    });

    if (errorMsg.length) {
        return resultError(errorMsg);
    }

    const updateCardData = data as UpdateCardData;
    try {
        const result = await collection("cards")
            .doc(updateCardData.id)
            .update({
                id: updateCardData.id,
                content: updateCardData.content,
                name: updateCardData.name,
            })
            .then(() => resultOk(""))
            .catch(() => resultError(""));

        return result;
    } catch (e) {
        errorLog(`updateBatchCard: #1 ${e}`, updateBatchCard.name);
    }

    return resultError(errorNames.userErrorList.onFindUserInfo, "");
}); // updateBatchCard()

interface CardMemberBasic {
    /** card ID */
    id: string;
    /** user ID */
    uid: string;
}
interface CardMember extends CardMemberBasic {
    memberName: string;
}
interface CardMemberOnSnapshotData {
    memberName: string;
    uid: string;
}
export const addCardMember = functions.https.onCall(async (data, context) => {
    const auth = authVerification(context);
    console.log("addCardMember #1");
    if (auth === false) {
        return resultError(errorNames.authErrorList.unauthenticated, null);
    }

    const errorMsg = verificationDataFields(data, {
        id: { type: "string", isRequirement: true, default: null },
        uid: { type: "string", isRequirement: true, default: null },
        memberName: { type: "string", isRequirement: true, default: null },
    });

    if (errorMsg.length) {
        return resultError(errorMsg);
    }

    const addCardMemberData = data as CardMember;

    try {
        let result = await collection("cards")
            .doc(addCardMemberData.id)
            .collection("members")
            .doc(addCardMemberData.uid)
            .set({
                memberName: addCardMemberData.memberName,
            })
            .then(() => resultOk(""))
            .catch(() => resultError(""));

        if (!result.result) {
            return result;
        }

        const members = [] as CardMemberOnSnapshotData[];
        result = await collection("cards")
            .doc(addCardMemberData.id)
            .collection("members")
            .get()
            .then((snapshot) => {
                snapshot.docs.forEach((doc) => {
                    if (doc.exists) {
                        members.push({
                            memberName: doc.data().memberName,
                            uid: doc.id,
                        });
                    }
                });
            })
            .then(() => resultOk(""))
            .catch(() => resultError(""));

        if (!result.result) {
            return result;
        }

        result = await collection("cards")
            .doc(addCardMemberData.id)
            .update({
                members,
            })
            .then(() => resultOk(""))
            .catch(() => resultError(""));

        return result;
    } catch (e) {
        errorLog(`addCardMember: #1 ${e}`, addCardMember.name);
    }

    return resultError(errorNames.userErrorList.onFindUserInfo, "");
}); // addCardMember()

export const removeCardMember = functions.https.onCall(
    async (data, context) => {
        const auth = authVerification(context);

        if (auth === false) {
            return resultError(errorNames.authErrorList.unauthenticated, null);
        }

        const errorMsg = verificationDataFields(data, {
            id: { type: "string", isRequirement: true, default: null },
            uid: { type: "string", isRequirement: true, default: null },
        });

        if (errorMsg.length) {
            return resultError(errorMsg);
        }

        const addCardMemberData = data as CardMemberBasic;

        try {
            let result = await collection("cards")
                .doc(addCardMemberData.id)
                .collection("members")
                .doc(addCardMemberData.uid)
                .delete()
                .then(() => resultOk(""))
                .catch(() => resultError(""));

            if (!result.result) {
                return result;
            }

            const members = [] as CardMemberOnSnapshotData[];
            result = await collection("cards")
                .doc(addCardMemberData.id)
                .collection("members")
                .get()
                .then((snapshot) => {
                    snapshot.docs.forEach((doc) => {
                        if (doc.exists) {
                            members.push({
                                memberName: doc.data().memberName,
                                uid: doc.id,
                            });
                        }
                    });
                })
                .then(() => resultOk(""))
                .catch(() => resultError(""));

            if (!result.result) {
                return result;
            }

            result = await collection("cards")
                .doc(addCardMemberData.id)
                .update({
                    members,
                })
                .then(() => resultOk(""))
                .catch(() => resultError(""));

            return result;
        } catch (e) {
            errorLog(`removeCardMember: #1 ${e}`, removeCardMember.name);
        }

        return resultError(errorNames.userErrorList.onFindUserInfo, "");
    }
); // removeCardMember()

interface RemoveCardData {
    prevCardId: string;
    removeCardId: string;
    nextCardId: string;
}
export const removeCard = functions.https.onCall(async (data, context) => {
    const auth = authVerification(context);

    if (auth === false) {
        return resultError(errorNames.authErrorList.unauthenticated, null);
    }

    const errorMsg = verificationDataFields(data, {
        prevCardId: { type: "string", isRequirement: true, default: null },
        removeCardId: { type: "string", isRequirement: true, default: null },
        nextCardId: { type: "string", isRequirement: true, default: null },
    });

    if (errorMsg.length) {
        return resultError(errorMsg);
    }

    const removeCardData = data as RemoveCardData;

    try {
        const batch = admin.firestore().batch();

        if (removeCardData.prevCardId !== "") {
            batch.update(collection("cards").doc(removeCardData.prevCardId), {
                nextCardId: removeCardData.nextCardId,
            });
        }

        const p1 = collection("cards")
            .doc(removeCardData.removeCardId)
            .collection("members")
            .get()
            .then((snapshot) => {
                snapshot.docs.forEach((doc) => {
                    if (doc.exists) {
                        batch.delete(
                            collection("cards")
                                .doc(removeCardData.removeCardId)
                                .collection("members")
                                .doc(doc.id)
                        );
                    }
                });
            });

        const p2 = collection("messages")
            .doc(removeCardData.removeCardId)
            .collection("contents")
            .get()
            .then((snapshot) => {
                snapshot.docs.forEach((doc) => {
                    if (doc.exists) {
                        batch.delete(
                            collection("messages")
                                .doc(removeCardData.removeCardId)
                                .collection("contents")
                                .doc(doc.id)
                        );
                    }
                });
            });

        await Promise.all([p1, p2]);

        batch.delete(collection("cards").doc(removeCardData.removeCardId));

        batch.delete(collection("messages").doc(removeCardData.removeCardId));

        const result = await batch
            .commit()
            .then(() => resultOk(""))
            .catch(() => resultError(""));

        return result;
    } catch (e) {
        errorLog(`removeCard: #1 ${e}`, removeCard.name);
    }

    return resultError(errorNames.userErrorList.onFindUserInfo, "");
}); // removeCard()
// ===== Cards : END

// ===== Messages : START
export const createMessage = functions.https.onCall(async (data, context) => {
    const auth = authVerification(context);

    if (auth === false) {
        return resultError(errorNames.authErrorList.unauthenticated, null);
    }

    const errorMsg = verificationDataFields(data, {
        messageId: { type: "string", isRequirement: true, default: null },
        contentId: { type: "string", isRequirement: true, default: null },
        content: { type: "string", isRequirement: true, default: null },
    });

    if (errorMsg.length) {
        return resultError(errorMsg);
    }

    try {
        const result = await collection("messages")
            .doc(data.messageId)
            .collection("contents")
            .doc(data.contentId)
            .set({
                content: data.content,
                timestamp: Date.now(),
                uid: auth.uid,
            })
            .then(() => resultOk(""))
            .catch(() => resultError(""));

        return result;
    } catch (e) {
        errorLog(`createMessage: #1 ${e}`, createMessage.name);
    }

    return resultError(errorNames.userErrorList.onFindUserInfo, "");
}); // createMessage()

export const updateMessage = functions.https.onCall(async (data, context) => {
    const auth = authVerification(context);

    if (auth === false) {
        return resultError(errorNames.authErrorList.unauthenticated, null);
    }

    const errorMsg = verificationDataFields(data, {
        messageId: { type: "string", isRequirement: true, default: null },
        contentId: { type: "string", isRequirement: true, default: null },
        content: { type: "string", isRequirement: true, default: null },
    });

    if (errorMsg.length) {
        return resultError(errorMsg);
    }

    try {
        const result = await collection("messages")
            .doc(data.messageId)
            .collection("contents")
            .doc(data.contentId)
            .update({
                content: data.content,
            })
            .then(() => resultOk(""))
            .catch(() => resultError(""));

        return result;
    } catch (e) {
        errorLog(`updateMessage: #1 ${e}`, updateMessage.name);
    }

    return resultError(errorNames.userErrorList.onFindUserInfo, "");
}); // updateMessage()

export const removeMessage = functions.https.onCall(async (data, context) => {
    const auth = authVerification(context);

    if (auth === false) {
        return resultError(errorNames.authErrorList.unauthenticated, null);
    }

    const errorMsg = verificationDataFields(data, {
        messageId: { type: "string", isRequirement: true, default: null },
        contentId: { type: "string", isRequirement: true, default: null },
    });

    if (errorMsg.length) {
        return resultError(errorMsg);
    }

    try {
        const result = await collection("messages")
            .doc(data.messageId)
            .collection("contents")
            .doc(data.contentId)
            .delete()
            .then(() => resultOk(""))
            .catch(() => resultError(""));

        return result;
    } catch (e) {
        errorLog(`removeMessage: #1 ${e}`, removeMessage.name);
    }

    return resultError(errorNames.userErrorList.onFindUserInfo, "");
}); // removeMessage()
// ===== Messages : END
