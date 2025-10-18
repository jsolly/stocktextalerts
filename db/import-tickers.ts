import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

/* =============
Environment Setup
============= */

config({ path: ".env.local" });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
	console.error("Missing Supabase environment variables");
	console.error("Required: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
	process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/* =============
Sample Stock Data
============= */

const POPULAR_STOCKS = [
	{ symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
	{ symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ" },
	{ symbol: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ" },
	{ symbol: "AMZN", name: "Amazon.com Inc.", exchange: "NASDAQ" },
	{ symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ" },
	{ symbol: "META", name: "Meta Platforms Inc.", exchange: "NASDAQ" },
	{ symbol: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ" },
	{ symbol: "BRK.B", name: "Berkshire Hathaway Inc.", exchange: "NYSE" },
	{ symbol: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE" },
	{ symbol: "JNJ", name: "Johnson & Johnson", exchange: "NYSE" },
	{ symbol: "V", name: "Visa Inc.", exchange: "NYSE" },
	{ symbol: "WMT", name: "Walmart Inc.", exchange: "NYSE" },
	{ symbol: "PG", name: "Procter & Gamble Co.", exchange: "NYSE" },
	{ symbol: "MA", name: "Mastercard Inc.", exchange: "NYSE" },
	{ symbol: "UNH", name: "UnitedHealth Group Inc.", exchange: "NYSE" },
	{ symbol: "HD", name: "Home Depot Inc.", exchange: "NYSE" },
	{ symbol: "DIS", name: "Walt Disney Co.", exchange: "NYSE" },
	{ symbol: "BAC", name: "Bank of America Corp.", exchange: "NYSE" },
	{ symbol: "XOM", name: "Exxon Mobil Corporation", exchange: "NYSE" },
	{ symbol: "NFLX", name: "Netflix Inc.", exchange: "NASDAQ" },
	{ symbol: "ADBE", name: "Adobe Inc.", exchange: "NASDAQ" },
	{ symbol: "CRM", name: "Salesforce Inc.", exchange: "NYSE" },
	{ symbol: "CSCO", name: "Cisco Systems Inc.", exchange: "NASDAQ" },
	{ symbol: "INTC", name: "Intel Corporation", exchange: "NASDAQ" },
	{ symbol: "AMD", name: "Advanced Micro Devices Inc.", exchange: "NASDAQ" },
	{ symbol: "PYPL", name: "PayPal Holdings Inc.", exchange: "NASDAQ" },
	{ symbol: "COST", name: "Costco Wholesale Corporation", exchange: "NASDAQ" },
	{ symbol: "PEP", name: "PepsiCo Inc.", exchange: "NASDAQ" },
	{ symbol: "AVGO", name: "Broadcom Inc.", exchange: "NASDAQ" },
	{ symbol: "TXN", name: "Texas Instruments Inc.", exchange: "NASDAQ" },
	{ symbol: "QCOM", name: "QUALCOMM Inc.", exchange: "NASDAQ" },
	{ symbol: "CMCSA", name: "Comcast Corporation", exchange: "NASDAQ" },
	{ symbol: "T", name: "AT&T Inc.", exchange: "NYSE" },
	{ symbol: "VZ", name: "Verizon Communications Inc.", exchange: "NYSE" },
	{ symbol: "TMO", name: "Thermo Fisher Scientific Inc.", exchange: "NYSE" },
	{ symbol: "NKE", name: "Nike Inc.", exchange: "NYSE" },
	{ symbol: "MCD", name: "McDonald's Corporation", exchange: "NYSE" },
	{ symbol: "LLY", name: "Eli Lilly and Company", exchange: "NYSE" },
	{ symbol: "ABBV", name: "AbbVie Inc.", exchange: "NYSE" },
	{ symbol: "ABT", name: "Abbott Laboratories", exchange: "NYSE" },
	{ symbol: "CVX", name: "Chevron Corporation", exchange: "NYSE" },
	{ symbol: "KO", name: "Coca-Cola Company", exchange: "NYSE" },
	{ symbol: "MRK", name: "Merck & Co. Inc.", exchange: "NYSE" },
	{ symbol: "PFE", name: "Pfizer Inc.", exchange: "NYSE" },
	{ symbol: "ORCL", name: "Oracle Corporation", exchange: "NYSE" },
	{ symbol: "IBM", name: "International Business Machines", exchange: "NYSE" },
	{ symbol: "WFC", name: "Wells Fargo & Company", exchange: "NYSE" },
	{ symbol: "C", name: "Citigroup Inc.", exchange: "NYSE" },
	{ symbol: "GS", name: "Goldman Sachs Group Inc.", exchange: "NYSE" },
	{ symbol: "MS", name: "Morgan Stanley", exchange: "NYSE" },
];

/* =============
Import Function
============= */

async function importTickers() {
	console.log("Starting ticker import...");
	console.log(`Importing ${POPULAR_STOCKS.length} stocks`);

	try {
		const { data, error } = await supabase
			.from("stocks")
			.upsert(POPULAR_STOCKS, { onConflict: "symbol" });

		if (error) {
			console.error("Error importing tickers:", error);
			process.exit(1);
		}

		console.log("✅ Successfully imported tickers");
		console.log(
			`Inserted/updated ${POPULAR_STOCKS.length} stocks in the database`,
		);
	} catch (error) {
		console.error("Unexpected error:", error);
		process.exit(1);
	}
}

/* =============
Main Execution
============= */

importTickers()
	.then(() => {
		console.log("Import complete!");
		process.exit(0);
	})
	.catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});

