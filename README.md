# NodeJS Stripe Implementation

This is a Stripe implementation for NodeJS!

Stripe official documentation [here](https://stripe.com/docs/api).

We are using ExpressJS for a simple and low level front and back end interface.

The databases are implemented with .txt files (in ```/db_simulation``` directory) and the module fs (to access and edit) in order to simplify the code.
- ```/db_simulation/users_table.txt``` is used to store all the users and their subscription information.
- ```/db_simulation/logged_events_table.txt``` is used to store all the payment events in order to avoid duplicate subscription registration.


## Get started

The best way to understand how something works is actually watching it work!
<br>Before you can run your app, please follow the simple steps below:
- Create the `.env` file (in this project root directory - same as main.js) with the following variables:<br>
`PORT`: Port listening for incoming requests.<br>
`STRIPE_SECRET`: Secret [Stripe API key](https://dashboard.stripe.com/test/apikeys).<br>
`STRIPE_WEBHOOK_SECRET`: Secret [Stripe API key](https://dashboard.stripe.com/test/webhooks/create?endpoint_location=local) for webhooks.<p>
Example:
    ```
    PORT=3000
    STRIPE_SECRET="sk_test_<your_secret>"
    STRIPE_WEBHOOK_SECRET="whsec_<your_secret>"
    ```
    Note: Replace '<your_secret>' with your Stripe Secrets.

- Create the products in [your Stripe dashboard](https://dashboard.stripe.com/test/products?create=product&source=product_list).
- In `main.js`, populate the `SUBSCRIPTIONS` array with your Stripe products (use price IDs: 'price_...'), according to the radio buttons order.<br>
Change the `DOMAIN` variable only if you are not running the app in localhost.
- In `/views/subscriptions.ejs` change, add or remove the radio buttons corresponding to your products. <br>The first radio button value has to be "1", the second "2", etc...</br>
- Run the following commands to install all the dependencies and run the app:
    ```
    npm install
    node main.js
    ```


## Test the webhooks locally

In order to test the webhooks without having to launch the server to a public domain, you need to set up a local webhook endpoint in Stripe:
```bash
stripe login
stripe listen --forward-to=localhost:3000/webhooks
```
Note: We are using the `PORT` 3000 for this example. Feel free to change it!


## Stripe testing payment methods

Get cards for testing stripe payment methods [here](https://docs.stripe.com/testing).


## Security

Check the [best practices](https://stripe.com/docs/webhooks#best-practices) to aknowledge some possible security vulnerability.

To understand better the Webhooks signature verification process [check this video explanation](https://www.youtube.com/watch?v=WLHvHUWd2ug&t=486s).
