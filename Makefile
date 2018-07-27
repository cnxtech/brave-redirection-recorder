SHELL := /bin/bash
WORKSPACE := $(pwd)
TMP_WORKSPACE := build/
TMP_RESROUCES := $(TMP_WORKSPACE)/resources
S3_BUCKET=com.brave.research.lambda-funcs
FUNCTION_NAME=brave-redirection-recorder
CHROME_HEADLESS_URL := https://github.com/adieuadieu/serverless-chrome/releases/download/v1.0.0-50/stable-headless-chromium-amazonlinux-2017-03.zip

all: build deploy

clean:
	test -f $(TMP_WORKSPACE)/$(FUNCTION_NAME).zip && rm $(TMP_WORKSPACE)/$(FUNCTION_NAME).zip || echo "clean"

test:
	docker run -it -v $(PWD):/var/task lambci/lambda:nodejs8.10 index.handler '{"url": "https://www.peteresnyder.com", "debug": true, "seconds": 10}'

build: clean
	rm -rf $(TMP_WORKSPACE)/
	mkdir -p $(TMP_WORKSPACE)/resources
	cp -r lib node_modules index.js record.js test.js $(TMP_WORKSPACE)
	rm -rf $(TMP_WORKSPACE)/node_modules/aws-sdk
	find $(TMP_WORKSPACE) -type d -name depot_tools | xargs rm -rf
	find $(TMP_WORKSPACE)/node_modules -type f -name "*.md" | xargs rm -rf
	find $(TMP_WORKSPACE)/node_modules -type d -name "test" | xargs rm -rf
	rm -rf $(TMP_WORKSPACE)/node_modules/eslint
	rm -rf $(TMP_WORKSPACE)/node_modules/eslint-*
	rm -rf $(TMP_WORKSPACE)/node_modules/pluralize
	rm -rf $(TMP_WORKSPACE)/node_modules/regexpp
	rm -rf $(TMP_WORKSPACE)/node_modules/ajv/dist/regenerator.min.js
	rm -rf $(TMP_WORKSPACE)/node_modules/puppeteer/.local-chromium
	test -f /tmp/chromium_headless.zip || curl -L $(CHROME_HEADLESS_URL) --output /tmp/chromium_headless.zip
	test -f $(TMP_WORKSPACE)/resources/headless-chromium || unzip /tmp/chromium_headless.zip -d $(TMP_WORKSPACE)/resources/
	cd $(TMP_WORKSPACE) && zip -r $(FUNCTION_NAME).zip *;

deploy:
	aws s3 cp $(TMP_WORKSPACE)/$(FUNCTION_NAME).zip s3://$(S3_BUCKET)/$(FUNCTION_NAME).zip
	aws lambda update-function-configuration --function-name $(FUNCTION_NAME) --environment Variables={S3_BUCKET=com.brave.research.redirections.unprocessed}
	aws lambda update-function-code --function-name $(FUNCTION_NAME) --s3-bucket $(S3_BUCKET) --s3-key $(FUNCTION_NAME).zip
