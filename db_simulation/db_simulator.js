const fs = require('fs').promises;
const stripe = require('stripe')(process.env.STRIPE_SECRET);

// Define the files to store the data (DB)
const users_db = './db_simulation/users_table.txt'
const logged_events_db = './db_simulation/logged_events_table.txt'

async function getData() {
    try {
        const data = await fs.readFile(users_db, 'utf8')
        return JSON.parse(data)
    } catch (err) {
        console.log("[DB_READ_ERROR] " + err)
        return null
    }
}

async function postData(data) {
    const jsonData = JSON.stringify(data)

    try {
        await fs.writeFile(users_db, jsonData)
        return true
    } catch (err) {
        console.log("[DB_WRITE_ERROR] " + err)
        return false
    }
}

async function register(email) {
    // Get the data from the database (if null create a new empty list)
    let db_data = await getData()
    if (db_data != null) {
        for (const user of db_data) {
            if (user.email == email) return false
        }
    } else {
        db_data = []
    }

    // Create the correspondent customer
    let customer;
    try {
        customer = await stripe.customers.create({ email: email });
    } catch (err) {
        console.log("[ERROR_CREATING_CUSTOMER] " + err)
        return false
    }

    // Create and post the user to the database
    db_data.push({
        email: email,
        customer_id: customer.id,
        active_sub: null,
        sub_status: null,
        cancel_at: null
    })
    return await postData(db_data)
}

/**
 * This function receives a user identification and retrieves the correspondent user.
 * @param {string} user_id - Customer ID or email representing the user.
 * @returns {Object} The correspondent user. null if there's no user with the provided identification.
 */
async function getUser(user_id) {
    let db_data = await getData()

    if (db_data == null) return null

    for (let i = 0; i < db_data.length; i++)
        if (db_data[i].customer_id == user_id || db_data[i].email == user_id)
            return db_data[i]

    return null
}

/**
 * This function sets a new subscription to the received user.
 * @param {string} user_id - Customer ID or email representing the user.
 * @param {string} sub_id - New subscription ID.
 * @returns {boolean} true if a new subscription is successfully set. false otherwise.
 */
async function set_new_sub(user_id, sub_id) {
    let db_data = await getData()

    if (db_data == null) return false

    for (let i = 0; i < db_data.length; i++) {
        if (db_data[i].customer_id == user_id || db_data[i].email == user_id) {
            db_data[i].active_sub = sub_id
            return await postData(db_data)
        }
    }

    return false            
}

/**
 * This function sets a new subscription status to the received user.
 * @param {string} user_id - Customer ID or email representing the user.
 * @param {string} status - New subscription status.
 * @param {int} cancel_at - Subscription cancel date (in unix timestamp).
 * @returns {boolean} true if a new subscription status is successfully set. false otherwise.
 */
async function set_sub_status(user_id, status, cancel_at) {
    let db_data = await getData()

    if (db_data == null) return false

    for (let i = 0; i < db_data.length; i++) {
        if (db_data[i].customer_id == user_id || db_data[i].email == user_id) {
            db_data[i].sub_status = status
            db_data[i].cancel_at = (cancel_at === undefined) ? db_data[i].cancel_at : cancel_at
            return await postData(db_data)
        }
    }

    return false            
}

/**
 * This function tries to change a subscription plan.
 * Fails if an error occurs or there is no active subscription.
 * @param {string} user_id - Customer ID or email representing the user.
 * @param {string} new_price - Price ID correspondent to the new subscription.
 * @returns {int} 0 if the active subscription is changed | 1 if there is no active subscription |
 * 2 if there is no user with the specified user_id.
 */
async function change_sub_status(user_id, new_price) {
    const user = await getUser(user_id)
    
    if (user == null) return 2

    const subscription_id = user.active_sub
    
    if (subscription_id == null) {
        return 1
    } else {  // User has a past/active subscription
        // Get the old subscription
        const old_sub = await stripe.subscriptions.retrieve(subscription_id)

        // Update the old subscription
        const new_sub = await stripe.subscriptions.update(subscription_id, {
            items: [{
                id: old_sub.items.data[0].id,
                price: new_price
            }],
            proration_behavior: 'always_invoice',
            cancel_at_period_end: false
        })

        return 0
    }
}


async function getLogs() {
    try {
        const data = await fs.readFile(logged_events_db, 'utf8')
        return JSON.parse(data)
    } catch (err) {
        console.log("[DB_READ_ERROR] " + err)
        return null
    }
}

async function getLog(event_id) {
    const logs = await getLogs()

    if (logs == null) return false

    for (const log of logs) {
        if (log == event_id) {
            return true
        }
    }

    return false
}

async function postLog(new_log) {
    let data = await getLogs()

    if (data == null) data = []

    data.push(new_log)

    const jsonData = JSON.stringify(data)

    try {
        await fs.writeFile(logged_events_db, jsonData)
        return true
    } catch (err) {
        console.log("[DB_WRITE_ERROR] " + err)
        return false
    }
}

module.exports = { getData, register, getUser, change_sub_status, set_new_sub, set_sub_status, getLog, postLog }