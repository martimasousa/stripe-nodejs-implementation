require('dotenv').config()
const database = require('./db_simulation/db_simulator')
const express = require('express')
const ejs = require('ejs')
const bodyParser = require('body-parser')
const stripe = require('stripe')(process.env.STRIPE_SECRET)


// Change this if you are not running on localhost
const DOMAIN = "http://localhost:" + process.env.PORT + "/"

// Populate this with your Stripe products prices IDs
const SUBSCRIPTIONS = [
    "price_1OdCCEIPZBp7aWOr9UKgMODn",
    "price_1OdCCjIPZBp7aWOr1MnsFDOB",
    "price_1OdfaZIPZBp7aWOrAZ7BwNzi"
]


const app = express()

app.set('view engine', 'ejs')

app.post('/webhooks', express.raw({type: 'application/json'}), async(req, res) => {
    const sig = req.headers['stripe-signature']

    let event
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
    } catch (err) {
        res.status(400).send(`Webhook Error: ${err.message}`)
        console.log(err)
        return
    }

    // Try to handle the event
    try {
        switch (event.type) {
            case 'payment_intent.succeeded':
                if (!(await database.getLog(event.data.object.id))) {
                    // Save the log to avoid duplicate subscription register
                    await database.postLog(event.data.object.id)
    
                    // Get the event subscription
                    const subscriptions = await stripe.subscriptions.list({
                        customer: event.data.object.customer,  
                        limit: 1,
                    })
                    const subscription = subscriptions.data[0]
    
                    // Check if it has a valid price
                    if (!SUBSCRIPTIONS.includes(subscription.plan.id)) {
                        console.log("[ERROR_SUBSCRIBING] No compatible price.")
                        return
                    }
                    
                    // Set the subscription status to active
                    database.set_new_sub(event.data.object.customer, subscription.id)
                }
                break
            case 'customer.subscription.updated':
                // Get cancel date (if cancelled)
                const cancel_at = (event.data.object.cancel_at_period_end)
                ? event.data.object.current_period_end : null

                // Set the new subscritpion status in the database
                database.set_sub_status(event.data.object.customer, event.data.object.status, cancel_at)
                break
            case 'customer.subscription.deleted':
                // Set the status to canceled and remove the subscription id (to avoid no_subscription_found error)
                await database.set_sub_status(event.data.object.customer, "canceled", undefined)
                database.set_new_sub(event.data.object.customer, null)
                break
            default:
                // TODO: Make sure that only the events defined in the webhook endpoint are received
                console.log(`Unhandled event type ${event.type}`)
        }
    } catch (err) {
        res.status(400).send(`Webhook Error: ${err.message}`)
        console.log(err)
        return
    }
    
    // Return a 200 response to acknowledge receipt of the event
    res.send()
})

// Don't apply this middleware to '/webhooks'
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.get('/', (req, res) => {
    res.render('index')
})

app.get('/subscribe', (req, res) => {
    res.render('subscriptions')
})

app.get('/register', (req, res) => {
    res.render('register')
})

app.post('/register', async (req, res) => {
    const user_email = req.body.email

    let send_msg = (await database.register(user_email))
        ? { msg: "User register succeeded! ", link: DOMAIN, link_msg: "Back Home" }
        : { msg: "User register failed! ", link: DOMAIN + "register/", link_msg: "Try again" }

    res.render('msg_page', { send_msg })
})

app.post('/checkout', async (req, res) => {
    const email = req.body.email
    const sub_type = req.body.subscription_choice
    const sub_price = SUBSCRIPTIONS[sub_type - 1]

    const sub_change_status = await database.change_sub_status(email, sub_price)
    if (sub_change_status == 0) {  // Active subscription successfully changed
        let send_msg = {
            msg: "Your subscription plan was successfully changed! ",
            link: DOMAIN,
            link_msg: "Back Home"
        }
        res.render('msg_page', { send_msg })
    } else if (sub_change_status == 1) {  // No active subscription
        // Get the user
        const user = await database.getUser(email)

        // Create the checkout session and redirect
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: user.customer_id,
            line_items: [ { price: sub_price, quantity: 1 } ],
            success_url: DOMAIN + "checkout_success/",
            cancel_url: DOMAIN + "checkout_cancel/",
        })
        res.redirect(303, session.url)
    } else if (sub_change_status == 2) {  // No user
        let send_msg = {
            msg: "Please insert a valid email! ",
            link: DOMAIN + "subscribe/",
            link_msg: "Try again"
        }
        res.render('msg_page', { send_msg })
    }
})

app.get('/checkout_success', (req, res) => {
    let send_msg = { msg: "Your order will be processed soon! ", link: DOMAIN, link_msg: "Back home" }
    res.render('msg_page', { send_msg })
})

app.get('/checkout_cancel', (req, res) => {
    let send_msg = { msg: "There is an error with your order! Please ", link: DOMAIN + "subscribe/", link_msg: "try again!" }
    res.render('msg_page', { send_msg })
})

app.get('/cancel', (req, res) => {
    res.render('cancel')
})

app.post('/cancel', async (req, res) => {
    const email = req.body.email

    const user = await database.getUser(email)

    if (user == null) {
        let send_msg = {
            msg: "Please insert a valid email! ",
            link: DOMAIN + "cancel/",
            link_msg: "Try again"
        }
        res.render('msg_page', { send_msg })
        return
    }

    if (user.sub_status != "active") {
        let send_msg = { msg: "Your subscription has already been cancelled! ", link: DOMAIN, link_msg: "Back home" }
        res.render('msg_page', { send_msg })
        return
    }

    // Set the subscription to end at the end of the period
    await stripe.subscriptions.update(user.active_sub, {
        cancel_at_period_end: true
    })

    let send_msg = { msg: "Your subscription was successfully cancelled! ", link: DOMAIN, link_msg: "Back home" }
    res.render('msg_page', { send_msg })
})


function convertTimestamp(unix_timestamp) {
    if (!unix_timestamp) return null

    let date = new Date(unix_timestamp * 1000);
    return date.getDate() + "/" + date.getMonth() + "/" + date.getFullYear()
}

app.get('/dashboard', async (req, res) => {
    let db_data = await database.getData();

    let send_msg = { msg: "", link: DOMAIN, link_msg: "Back Home" }

    if (db_data != null) {
        for (const user of db_data) {
            let cancel_msg = (user.sub_status == "canceled") ? "Canceled" : "Cancel"
            send_msg.msg += user.email + "&nbsp;&nbsp;&nbsp;&nbsp;Subscription_ID:&nbsp;"
                + user.active_sub + "&nbsp;&nbsp;&nbsp;&nbsp;Status:&nbsp;" + user.sub_status
                + "&nbsp;&nbsp;&nbsp;&nbsp;" + cancel_msg + " at:&nbsp;"
                + convertTimestamp(user.cancel_at) + "<br>"
        }
    }

    res.render('msg_page', { send_msg })
})


app.get('/portal', (req, res) => {
    res.render('portal')
})

app.post('/portal', async (req, res) => {
    const email = req.body.email

    const user = await database.getUser(email)

    if (user == null) {
        let send_msg = {
            msg: "Please insert a valid email! ",
            link: DOMAIN + "portal/",
            link_msg: "Try again"
        }
        res.render('msg_page', { send_msg })
        return
    }

    // TODO: To reduce the Stripe requests store the config object ???
    const configuration = await stripe.billingPortal.configurations.create({
        business_profile: {
            privacy_policy_url: DOMAIN,
            terms_of_service_url: DOMAIN,
        },
        features: {
            customer_update: {
                allowed_updates: ['tax_id', 'address', 'phone'],
                enabled: true
            },
            payment_method_update: { enabled: true },
            invoice_history: { enabled: false },
            subscription_cancel: { enabled: false },
            subscription_pause: { enabled: false }
        },
    })

    const session = await stripe.billingPortal.sessions.create({
        configuration: configuration.id,
        customer: user.customer_id,
        return_url: DOMAIN,
    })
    res.redirect(303, session.url)
})


// Execute some scripts (outside the app)
app.get('/retrieve', async (req, res) => {
    //const subscription = await stripe.subscriptions.retrieve('sub_1OdlMPIPZBp7aWOrRHj294xd')
    //console.log(subscription.status)

    // Delete all subscriptions
    const subscriptions = await stripe.subscriptions.list({})
    for (const sub of subscriptions.data) {
        await stripe.subscriptions.cancel(sub.id)
    }

    // Delete all customers
    const customers = await stripe.customers.list({})
    for (const cus of customers.data) {
        await stripe.customers.del(cus.id)
    }


    res.redirect(DOMAIN)
})


app.listen(process.env.PORT, () => {
    console.log("App running on: " + DOMAIN)
})